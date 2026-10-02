/**
 * @file queue_state.js
 * @description Máquina de estados de la cola de descargas del pipeline PS5.
 *   Corrige el bug de desincronización del sequencer viejo (estado en RAM que
 *   nunca reflejaba lo que IDM estaba descargando → descargas duplicadas).
 *   Decisiones puras (decide/reconcile) + IO atómico (load/save); el emparejamiento
 *   nombre↔artefacto vive en artifact_match.js (tags + acentos).
 * SRP < 300L.
 */
const fs = require('node:fs');
const path = require('node:path');
function writeFileSyncAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, `.${path.basename(filePath)}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, filePath);
}
const { slugTokens, matchesArtifact, matchesTags, isStrictSubset } = require('./artifact_match.js');

const STATUS = Object.freeze({
  PENDING: 'pending',
  INJECTED: 'injected',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
});


/**
 * @typedef {{ name: string, url: string, status: string, attempts: number, note: string, tags?: string[], nextAttemptAt?: number, injectedAt?: string, completedAt?: string }} QueueItem
 * @typedef {{ version: number, items: QueueItem[], updatedAt?: string }} QueueState
 */

/**
 * @param {Array<{ name: string, url: string, status?: string, note?: string }>} items
 * @returns {QueueState}
 */
function createState(items) {
  return {
    version: 1,
    items: (items || []).map((item) => ({
      name: item.name,
      url: item.url,
      status: item.status || STATUS.PENDING,
      attempts: 0,
      note: item.note || '',
      tags: Array.isArray(item.tags) ? item.tags : undefined,
    })),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * @param {QueueState} state
 * @param {string[]} artifacts
 * @returns {number} cantidad de items reconciliados
 */
function reconcile(state, artifacts) {
  const candidates = state.items.filter(
    (item) => item.status === STATUS.PENDING || item.status === STATUS.INJECTED,
  );
  const tokenMap = new Map(candidates.map((item) => [item, slugTokens(item.name)]));
  let changed = 0;
  for (const item of candidates) {
    const hit = artifacts.find((a) => matchesArtifact(item.name, a) || matchesTags(item.tags, a));
    if (!hit) continue;
    const shadowed = candidates.some((other) => {
      if (other === item) return false;
      if (!isStrictSubset(tokenMap.get(item), tokenMap.get(other))) return false;
      return matchesArtifact(other.name, hit) || matchesTags(other.tags, hit);
    });
    if (shadowed) continue;
    item.status = STATUS.COMPLETED;
    item.note = matchesArtifact(item.name, hit)
      ? 'detectado en disco (reconciliación)'
      : 'detectado en disco (reconciliación con etiqueta)';
    item.completedAt = new Date().toISOString();
    changed += 1;
  }
  return changed;
}

/**
 * @param {QueueState} state
 * @returns {number} índice del item inyectado activo o -1
 */
function findActive(state) {
  return state.items.findIndex((item) => item.status === STATUS.INJECTED);
}

/**
 * @param {QueueState} state
 * @param {number} now
 * @returns {number} índice del siguiente pendiente elegible o -1
 */
function findNextPending(state, now) {
  return state.items.findIndex(
    (item) => item.status === STATUS.PENDING && (!item.nextAttemptAt || item.nextAttemptAt <= now),
  );
}

/**
 * Decide la siguiente acción del ciclo.
 * @param {QueueState} state
 * @param {{ idmBusy: boolean, now: number }} opts
 * @returns {{ type: 'wait'|'inject'|'complete'|'none', index?: number, reason?: string }}
 */
function decide(state, opts) {
  const active = findActive(state);
  if (active >= 0) {
    if (opts.idmBusy) return { type: 'wait', reason: 'IDM descargando (inyección en curso)', index: active };
    return { type: 'complete', index: active };
  }
  if (opts.idmBusy) return { type: 'wait', reason: 'IDM ocupado (descarga externa al pipeline)' };
  const next = findNextPending(state, opts.now);
  if (next >= 0) return { type: 'inject', index: next };
  if (state.items.some((item) => item.status === STATUS.PENDING)) {
    return { type: 'wait', reason: 'pendientes en backoff' };
  }
  return { type: 'none', reason: 'cola terminada' };
}

/**
 * @param {QueueState} state
 * @param {number} index
 * @param {string} [note]
 */
function markInjected(state, index, note = 'inyectado a IDM') {
  const item = state.items[index];
  item.status = STATUS.INJECTED;
  item.note = note;
  item.injectedAt = new Date().toISOString();
  delete item.nextAttemptAt;
}

/**
 * @param {QueueState} state
 * @param {number} index
 * @param {string} [note]
 */
function markCompleted(state, index, note = 'descarga completada') {
  const item = state.items[index];
  item.status = STATUS.COMPLETED;
  item.note = note;
  item.completedAt = new Date().toISOString();
}

/**
 * @param {QueueState} state
 * @param {number} index
 * @param {string} [reason]
 */
function markSkipped(state, index, reason = 'sin enlace disponible') {
  const item = state.items[index];
  item.status = STATUS.SKIPPED;
  item.note = reason;
}

/**
 * Registra un intento fallido con backoff exponencial; a los maxAttempts pasa a failed.
 * @param {QueueState} state
 * @param {number} index
 * @param {{ now: number, baseMs: number, maxMs: number, maxAttempts: number }} opts
 * @returns {{ failed: boolean, attempts: number, nextAttemptAt?: number }}
 */
function applyAttempt(state, index, opts) {
  const item = state.items[index];
  item.attempts += 1;
  if (item.attempts >= opts.maxAttempts) {
    item.status = STATUS.FAILED;
    item.note = `fallo tras ${item.attempts} intentos`;
    return { failed: true, attempts: item.attempts };
  }
  const waitMs = Math.min(opts.baseMs * 2 ** (item.attempts - 1), opts.maxMs);
  item.nextAttemptAt = opts.now + waitMs;
  item.note = `intento ${item.attempts} falló; reintento en ${Math.round(waitMs / 1000)}s`;
  return { failed: false, attempts: item.attempts, nextAttemptAt: item.nextAttemptAt };
}

/**
 * @param {QueueState} state
 * @returns {{ total: number, pending: number, injected: number, completed: number, failed: number, skipped: number, next: string|null }}
 */
function summarize(state) {
  const count = (status) => state.items.filter((item) => item.status === status).length;
  const next =
    state.items.find((item) => item.status === STATUS.INJECTED) ||
    state.items.find((item) => item.status === STATUS.PENDING);
  return {
    total: state.items.length,
    pending: count(STATUS.PENDING),
    injected: count(STATUS.INJECTED),
    completed: count(STATUS.COMPLETED),
    failed: count(STATUS.FAILED),
    skipped: count(STATUS.SKIPPED),
    next: next ? `${next.name} [${next.status}]` : null,
  };
}

/**
 * @param {string} filePath
 * @returns {QueueState}
 */
function loadState(filePath) {
  if (!fs.existsSync(filePath)) return createState([]);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!parsed || !Array.isArray(parsed.items)) return createState([]);
    return parsed;
  } catch {
    return createState([]);
  }
}

/**
 * @param {string} filePath
 * @param {QueueState} state
 */
function saveState(filePath, state) {
  state.updatedAt = new Date().toISOString();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  writeFileSyncAtomic(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

module.exports = {
  STATUS,
  matchesArtifact,
  matchesTags,
  createState,
  reconcile,
  decide,
  markInjected,
  markCompleted,
  markSkipped,
  applyAttempt,
  summarize,
  loadState,
  saveState,
};
