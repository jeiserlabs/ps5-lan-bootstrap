/**
 * @file ps5_compatibility.js
 * @description Filtro de compatibilidad PS4(fPKG) → PS5 con jailbreak.
 *
 *   IMPORTANTE — de dónde sale cada veredicto:
 *   · `TITLE_COMPAT` es EVIDENCIA LOCAL reproducida en esta consola/PC
 *     (ledger `data/logs/lan_installer.log` + auditoría FTP). Solo `block`
 *     impide instalar y exige evidencia determinista (mismo byte, N veces).
 *   · `SCENE_REPORTS` son reportes de foros SIN verificar. NUNCA bloquean:
 *     se devuelven como anotación informativa (`info`). La tabla de foros
 *     marcaba como "incompatibles" juegos que la auditoría FTP confirma
 *     instalados y funcionando en esta PS5 FW 13.40 (CUSA13323, CUSA07408,
 *     CUSA28561, CUSA13795, CUSA16742): bloquearlos habría roto el pipeline.
 *   · `parseStallEvidence()` deriva la evidencia del propio log, para que la
 *     lista de bloqueos se regenere con datos y no con opiniones.
 *
 * SRP < 300L. Cero dependencias externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/** Anotación informativa de foros: nunca bloquea por sí sola. */
const SEVERITY = { OK: 'ok', INFO: 'info', WARN: 'warn', BLOCK: 'block' };

/**
 * Títulos con evidencia LOCAL. `block` = no instalar (rechazo determinista).
 * @type {Record<string, { severity: string, title: string, reason: string, evidence: string, action: string }>}
 */
const TITLE_COMPAT = {
  CUSA34386: {
    severity: SEVERITY.BLOCK,
    title: 'God of War Ragnarök (EU)',
    reason: 'Rechazo determinista del stack PS5: 3 intentos mueren en el MISMO byte (13.17 GB) con 326 GB libres. No es espacio ni red.',
    evidence: 'data/logs/lan_installer.log 2026-10-07 17:25 (13.19 GB) y 18:41 (13.17 GB); descartado disco lleno (84.96 GB con 0 libres)',
    action: 'Usar el dump US (CUSA34384) o instalar con el Package Installer de la consola (Ajustes → Depuración → Juego → Instalar paquete).',
  },
  CUSA01967: {
    severity: SEVERITY.WARN,
    title: 'Horizon Zero Dawn (US)',
    reason: 'Base de 40.4 GB estancada a los 37.5/37.88 GB (no determinista): transferencia perdida al final.',
    evidence: 'data/logs/lan_installer.log 2026-10-06 00:07',
    action: 'Preferir CUSA10213 (base+update ya instalados y funcionando).',
  },
  CUSA19035: {
    severity: SEVERITY.WARN,
    title: 'Título no identificado (CUSA19035)',
    reason: 'Base estancada a los 3.99 GB en el intento registrado.',
    evidence: 'data/logs/lan_installer.log 2026-10-06',
    action: 'Reintentar con el PKG verificado; si repite el mismo byte, tratar como rechazo determinista.',
  },
  CUSA34384: {
    severity: SEVERITY.WARN,
    title: 'God of War Ragnarök (US)',
    reason: 'Intento previo: transferencia completa al 100% pero el registro no se confirmó por FTP.',
    evidence: 'data/logs/lan_installer.log 2026-10-06 00:37 (VERIFICACIÓN FTP FALLÓ tras 90.6 GB)',
    action: 'Reintentar (dump US correcto). Si vuelve a fallar el registro, usar el Package Installer de la consola.',
  },
  CUSA11518: {
    severity: SEVERITY.WARN,
    title: 'Mortal Kombat 11 (LAT)',
    reason: 'La base instala bien, pero el update ALL.DLC.MOD apaga la consola al abrir el juego.',
    evidence: 'Ledger 2026-10-05 23:53 (update MOD instalado) + verificación FTP posterior de la base',
    action: 'No instalar MODs: `pkgRules.isModBlocked()` ya los filtra en daemon y orquestador LAN.',
  },
};

/**
 * Reportes de foros (Tekqart/PSXHAX/GBAtemp) recogidos en el informe de auditoría.
 * `localAudit` documenta qué dice LA CONSOLA REAL: si dice 'installed', el
 * reporte del foro está contradicho y el título NUNCA debe bloquearse.
 * @type {Record<string, { issue: string, localAudit: 'installed'|'unknown'|'not-applicable' }>}
 */
const SCENE_REPORTS = {
  CUSA13323: { issue: 'Ghost of Tsushima: "no se ejecuta correctamente en PS5"', localAudit: 'installed' },
  CUSA07408: { issue: 'God of War 2018 EUR: "la base no instala/arranca en FW 13.40"', localAudit: 'installed' },
  CUSA28561: { issue: 'Horizon Forbidden West: "backport incompatible con 13.40"', localAudit: 'installed' },
  CUSA13795: { issue: 'Crash Team Racing: "los DLCs sueltos no funcionan"', localAudit: 'installed' },
  CUSA16742: { issue: 'It Takes Two: "problemas de instalación en algunos firmwares"', localAudit: 'installed' },
  CUSA20499: { issue: 'Cuphead: "requiere un orden de instalación específico"', localAudit: 'installed' },
  CUSA57220: { issue: 'EA Sports FC 27: "el UNLOCK_OFFLINE no funciona en PS5"', localAudit: 'not-applicable' },
  CUSA57447: { issue: 'Resident Evil 4 Remake: "problemas de sonido y guardado"', localAudit: 'unknown' },
  CUSA30992: { issue: 'TMNT Shredder\'s Revenge: "reportado como incompatible"', localAudit: 'unknown' },
  CUSA34386: { issue: 'GoW Ragnarök EUR: "la base no instala en FW 13.40"', localAudit: 'unknown' },
};

const TITLE_ID_RE = /^[A-Z]{4}\d{5}$/;

/**
 * @param {string} value
 * @returns {string} Title ID normalizado o '' si no hay ninguno
 */
function normalizeTitleId(value) {
  const match = String(value || '').toUpperCase().match(/[A-Z]{4}\d{5}/);
  return match && TITLE_ID_RE.test(match[0]) ? match[0] : '';
}

/**
 * Consulta la compatibilidad de un título.
 * Fail-open por diseño: un título sin evidencia local es compatible.
 * @param {string} titleIdOrFilename
 * @returns {{ titleId: string, compatible: boolean, severity: string, reason: string, evidence: string, action: string, sceneReport: { issue: string, localAudit: string } | null }}
 */
function checkCompatibility(titleIdOrFilename) {
  const titleId = normalizeTitleId(titleIdOrFilename);
  const entry = titleId ? TITLE_COMPAT[titleId] : null;
  const scene = titleId ? SCENE_REPORTS[titleId] || null : null;
  if (!entry) {
    return {
      titleId,
      compatible: true,
      severity: scene ? SEVERITY.INFO : SEVERITY.OK,
      reason: scene ? `Reporte de foro sin verificar (${scene.issue}); la evidencia local no lo respalda.` : 'Sin evidencia de incompatibilidad local.',
      evidence: scene ? `localAudit=${scene.localAudit}` : '',
      action: scene ? 'Anotación informativa: no bloquea la instalación.' : '',
      sceneReport: scene,
    };
  }
  return {
    titleId,
    compatible: entry.severity !== SEVERITY.BLOCK,
    severity: entry.severity,
    reason: entry.reason,
    evidence: entry.evidence,
    action: entry.action,
    sceneReport: scene,
  };
}

/**
 * ¿Bloquea la instalación este título? (única puerta que deben usar los scripts)
 * @param {string} titleIdOrFilename
 * @returns {boolean}
 */
function isInstallBlocked(titleIdOrFilename) {
  return !checkCompatibility(titleIdOrFilename).compatible;
}

/**
 * Títulos reportados SOLO por foros y desmentidos por la consola real.
 * Guarda de regresión: si alguno aparece bloqueado, el filtro se contaminó
 * con la lista de foros.
 * @returns {string[]}
 */
function contradictedSceneReports() {
  return Object.entries(SCENE_REPORTS)
    .filter(([, v]) => v.localAudit === 'installed')
    .map(([id]) => id);
}

/**
 * Detecta rechazo determinista: ≥2 caídas en el MISMO byte (±tolerancia).
 * @param {number[]} bytesList bytes donde se estancó cada intento
 * @param {number} [toleranceBytes=64MB]
 * @returns {{ deterministic: boolean, byte: number|null, repeats: number }}
 */
function deterministicRejection(bytesList, toleranceBytes = 64 * 1024 ** 2) {
  const bytes = (bytesList || []).filter((b) => Number.isFinite(b) && b > 0);
  let best = { byte: null, repeats: 0 };
  for (const ref of bytes) {
    const repeats = bytes.filter((b) => Math.abs(b - ref) <= toleranceBytes).length;
    if (repeats > best.repeats) best = { byte: ref, repeats };
  }
  return { deterministic: best.repeats >= 2, byte: best.byte, repeats: best.repeats };
}

/**
 * Agrupa bytes de estancamiento en clusters (±tolerancia) para ver la HISTORIA
 * completa: un título puede tener 34 caídas a 3.31 GB (bug de reentrancia del
 * daemon) y 2 a 13.17 GB (rechazo real del cliente). Un "byte dominante" único
 * esconde el diagnóstico.
 * @param {number[]} bytesList
 * @param {number} [toleranceBytes=64MB]
 * @returns {Array<{ byte: number, count: number }>} mayor count primero
 */
function groupStalls(bytesList, toleranceBytes = 64 * 1024 ** 2) {
  /** @type {Array<{ byte: number, count: number, sum: number }>} */
  const clusters = [];
  for (const b of (bytesList || []).filter((n) => Number.isFinite(n) && n > 0)) {
    const hit = clusters.find((c) => Math.abs(c.byte - b) <= toleranceBytes);
    if (hit) {
      hit.count += 1;
      hit.sum += b;
      hit.byte = hit.sum / hit.count;
    } else {
      clusters.push({ byte: b, count: 1, sum: b });
    }
  }
  return clusters
    .map(({ byte, count }) => ({ byte, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Deriva la evidencia de fallos del ledger real (`Transferencia estancada a los X GB`
 * tras `Preparando: [CUSA…]`). Convierte "opiniones de foro" en datos del log.
 * OJO: el log atribuye cada caída al último `Preparando:`; los miles de cortes a
 * ~3.3 GB son el bug de reentrancia del daemon (varios ciclos solapados), no un
 * rechazo del título. Por eso la evidencia NO bloquea por sí sola: el registro
 * `TITLE_COMPAT` se cura a mano cruzando éxito FTP + determinismo.
 * @param {string} logText
 * @param {{ toleranceBytes?: number }} [opts]
 * @returns {Record<string, { titleId: string, count: number, stallsGb: number[], bytes: number[], byte: number|null, deterministic: boolean }>}
 */
function parseStallEvidence(logText, opts = {}) {
  const out = {};
  let current = '';
  for (const line of String(logText || '').split(/\r?\n/)) {
    const prep = line.match(/Preparando: \[([A-Z]{4}\d{5})\]/);
    if (prep) {
      current = prep[1];
      if (!out[current]) out[current] = { titleId: current, count: 0, stallsGb: [], byte: null, deterministic: false };
      continue;
    }
    const stall = line.match(/Transferencia estancada a los ([\d.]+) GB/);
    if (stall && current && out[current]) {
      const gb = Number(stall[1]);
      out[current].stallsGb.push(gb);
      out[current].count = out[current].stallsGb.length;
      out[current]._bytes = (out[current]._bytes || []).concat(Math.round(gb * 1e9));
    }
  }
  for (const entry of Object.values(out)) {
    const verdict = deterministicRejection(entry._bytes || [], opts.toleranceBytes);
    entry.deterministic = verdict.deterministic;
    entry.byte = verdict.byte;
    entry.bytes = entry._bytes || [];
    delete entry._bytes;
  }
  return out;
}

/**
 * Títulos cuya instalación SÍ se completó y verificó por FTP (contra-evidencia
 * de los reportes de foros).
 * @param {string} logText
 * @returns {string[]} Title IDs únicos
 */
function parseSuccessEvidence(logText) {
  const ids = new Set();
  for (const line of String(logText || '').split(/\r?\n/)) {
    if (!/INSTALACIÓN COMPLETADA Y VERIFICADA/.test(line)) continue;
    const id = normalizeTitleId(line);
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Compara dos versiones de firmware ("13.40" > "11.60").
 * @param {string} a
 * @param {string} b
 * @returns {number} -1 | 0 | 1 (null-parsed = 0)
 */
function compareFirmware(a, b) {
  const pa = String(a || '').match(/(\d+)\.(\d+)/);
  const pb = String(b || '').match(/(\d+)\.(\d+)/);
  if (!pa || !pb) return 0;
  const va = Number(pa[1]) * 100 + Number(pa[2]);
  const vb = Number(pb[1]) * 100 + Number(pb[2]);
  return va === vb ? 0 : (va > vb ? 1 : -1);
}

/**
 * Lee `payloads/compatibility.json` (matriz FW↔payloads).
 * @param {string} [compatPath]
 * @returns {{ targetConsoleFw?: string, payloads?: Record<string, { minFw?: string, maxFw?: string, notes?: string }> } | null}
 */
function loadPayloadCompatibility(compatPath) {
  const file = compatPath || path.join(__dirname, '..', '..', 'payloads', 'compatibility.json');
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Verifica que un payload declarado soporte el firmware de la consola.
 * Antes se validaba SOLO el SHA256 (integridad), nunca la compatibilidad:
 * un kstuff nuevo "para 14.xx" habría entrado y roto el jailbreak.
 * @param {string} payloadName
 * @param {string} consoleFw
 * @param {object} [compat] matriz ya cargada
 * @returns {{ known: boolean, compatible: boolean, reason: string, notes: string }}
 */
function checkPayloadFirmware(payloadName, consoleFw, compat) {
  const matrix = compat || loadPayloadCompatibility();
  const entry = matrix && matrix.payloads ? matrix.payloads[payloadName] : null;
  if (!entry) {
    return { known: false, compatible: false, reason: `Payload sin entrada en payloads/compatibility.json (FW de la consola ${consoleFw})`, notes: '' };
  }
  const { minFw, maxFw, notes } = entry;
  if (minFw && compareFirmware(consoleFw, minFw) < 0) {
    return { known: true, compatible: false, reason: `${payloadName} requiere FW >= ${minFw} y la consola está en ${consoleFw}`, notes: notes || '' };
  }
  if (maxFw && compareFirmware(consoleFw, maxFw) > 0) {
    return { known: true, compatible: false, reason: `${payloadName} soporta hasta FW ${maxFw} y la consola está en ${consoleFw}`, notes: notes || '' };
  }
  return { known: true, compatible: true, reason: `Compatible con FW ${consoleFw} (${minFw || '—'}–${maxFw || '—'})`, notes: notes || '' };
}

module.exports = {
  SEVERITY,
  TITLE_COMPAT,
  SCENE_REPORTS,
  normalizeTitleId,
  checkCompatibility,
  isInstallBlocked,
  contradictedSceneReports,
  deterministicRejection,
  groupStalls,
  parseStallEvidence,
  parseSuccessEvidence,
  compareFirmware,
  loadPayloadCompatibility,
  checkPayloadFirmware,
};
