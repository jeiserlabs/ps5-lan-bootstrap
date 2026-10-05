#!/usr/bin/env node
/**
 * @file sequencer.js
 * @description Sequencer de descargas del pipeline PS5: resuelve enlaces directos de AkiraBox
 *   vía Playwright CDP (Brave) y los inyecta a IDM de a uno para no saturar la red.
 *   Endurecido contra los bugs del scratch de Antigravity: estado reconciliado con disco,
 *   backoff con tope de intentos, una sola ventana de Brave por resolución y pidfile.
 * Uso:
 *   node scripts/ps5/sequencer.js           # Loop (vigila IDM y avanza la cola)
 *   node scripts/ps5/sequencer.js --once    # Un solo ciclo
 *   node scripts/ps5/sequencer.js --status  # Resumen de la cola y sale
 * SRP < 300L.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { getPs5Config } = require('../lib/config.js');
const queueState = require('../lib/queue_state.js');
const { logPs5 } = require('../lib/pipeline_log.js');
const { acquirePid, releasePid } = require('../lib/pidfile.js');

const cfg = getPs5Config();
const STATE_FILE = path.join(cfg.state.cacheDir, 'queue_state.json');
const PID_FILE = path.join(cfg.state.cacheDir, 'sequencer.pid');
const TAG = 'SEQUENCER';
const ARCHIVE_EXT = new Set(['.rar', '.zip', '.pkg', '.7z']);

/**
 * Recolecta nombres de artefactos descargados (Desktop + bibliotecas), profundidad limitada.
 * @param {string} dir
 * @param {number} depth
 * @param {string[]} out
 */
function walk(dir, depth, out) {
  if (depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, depth - 1, out);
    } else if (ARCHIVE_EXT.has(path.extname(entry.name).toLowerCase())) {
      out.push(entry.name);
    }
  }
}

function collectArtifacts() {
  const out = [];
  walk(cfg.paths.watchDir, 1, out);
  for (const dir of cfg.paths.libraryDirs) walk(dir, 3, out);
  return out;
}

/**
 * Estado de IDM: `active` = escribiendo ahora; `hasResidue` = quedan archivos de descarga
 * (pausada/incompleta) aunque no haya actividad reciente. Evita marcar como completada una
 * descarga pausada y arrancar la siguiente en paralelo.
 * @returns {{ active: boolean, hasResidue: boolean }}
 */
function getIdmState() {
  const out = { active: false, hasResidue: false };
  const root = cfg.paths.idmDataDir;
  if (!fs.existsSync(root)) return out;
  const windowMs = cfg.queue.idmActiveWindowMs;
  const stacks = [root];
  while (stacks.length) {
    const dir = stacks.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stacks.push(full);
        continue;
      }
      if (entry.name.endsWith('.log')) continue;
      out.hasResidue = true;
      try {
        if (Date.now() - fs.statSync(full).mtimeMs < windowMs) out.active = true;
      } catch {
        // archivo desapareció entre el listado y el stat
      }
    }
  }
  return out;
}

/**
 * Resuelve el enlace directo de la API de AkiraBox interceptando la respuesta con CDP.
 * @param {{ name: string, url: string }} item
 * @returns {Promise<string|null>}
 */
async function resolveDirectUrl(item) {
  let chromium;
  try {
    chromium = require('playwright-core').chromium;
  } catch {
    try {
      chromium = require('playwright').chromium;
    } catch {
      throw new Error('Playwright no está disponible. Ejecuta: npm install');
    }
  }
  const browser = await chromium.launch({
    executablePath: cfg.paths.braveExe,
    headless: false,
    args: ['--window-size=1280,800', '--disable-blink-features=AutomationControlled'],
  });
  let directUrl = null;
  try {
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    const client = await context.newCDPSession(page);
    await client.send('Network.enable');
    client.on('Network.responseReceived', async (event) => {
      if (directUrl) return;
      if (!event.response.url.includes('/api/files/') || !event.response.url.includes('/download')) return;
      try {
        const body = await client.send('Network.getResponseBody', { requestId: event.requestId });
        const json = JSON.parse(body.body);
        const found = json.downloadUrl || json.url;
        if (found && String(found).startsWith('http')) directUrl = found;
      } catch {
        // respuesta no-JSON: se ignora
      }
    });

    await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);

    try {
      const challenge = page.frameLocator('iframe[src*="challenges.cloudflare.com"]');
      const box = await challenge.locator('body').boundingBox({ timeout: 3000 });
      if (box) {
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;
        await page.mouse.move(x, y, { steps: 5 });
        await page.mouse.click(x, y);
      }
    } catch {
      // sin Turnstile presente
    }

    for (let wait = 0; wait < 15 && !directUrl; wait += 1) {
      await page.waitForTimeout(1000);
      try {
        const button = page.locator('#download').first();
        if ((await button.count()) > 0 && (await button.getAttribute('aria-disabled')) !== 'true') {
          await button.click({ timeout: 1500 });
        }
      } catch {
        // la página pudo navegar o el botón no está listo: se reintenta en la siguiente iteración
      }
    }
    return directUrl;
  } finally {
    try {
      await browser.close();
    } catch {
      // navegador ya cerrado
    }
  }
}

/**
 * @param {string} directUrl
 */
function injectToIdm(directUrl) {
  const child = spawn(cfg.paths.idmExe, ['/d', directUrl, '/p', cfg.paths.watchDir, '/n'], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

let lastMessage = '';
/**
 * Log con supresión de repetidos (el loop corre cada 30s y no debe spamear).
 * @param {string} message
 */
function note(message) {
  if (message === lastMessage) return;
  lastMessage = message;
  logPs5(TAG, message, cfg.state.logFile);
}

async function cycle() {
  const state = queueState.loadState(STATE_FILE);
  const artifacts = collectArtifacts();
  if (queueState.reconcile(state, artifacts) > 0) {
    queueState.saveState(STATE_FILE, state);
    note('Reconciliación con disco: item(s) ya presentes → completed');
  }

  const idm = getIdmState();
  const idmBusy = idm.active || idm.hasResidue;
  let action = queueState.decide(state, { idmBusy, now: Date.now() });

  if (action.type === 'complete') {
    const item = state.items[action.index];
    queueState.markCompleted(state, action.index, 'IDM liberó tras la inyección');
    queueState.saveState(STATE_FILE, state);
    note(`Completado: ${item.name}`);
    action = queueState.decide(state, { idmBusy: false, now: Date.now() });
  }

  if (action.type === 'inject') {
    const item = state.items[action.index];
    if (!item.url || item.url === 'PENDING_URL') {
      queueState.markSkipped(state, action.index, 'sin enlace disponible');
      queueState.saveState(STATE_FILE, state);
      note(`Saltado (sin enlace): ${item.name}`);
      return state;
    }
    note(`Resolviendo enlace fresco: ${item.name}`);
    try {
      const directUrl = await resolveDirectUrl(item);
      if (!directUrl) throw new Error('la API no devolvió enlace directo');
      injectToIdm(directUrl);
      queueState.markInjected(state, action.index);
      queueState.saveState(STATE_FILE, state);
      note(`Inyectado a IDM: ${item.name}`);
    } catch (err) {
      const attempt = queueState.applyAttempt(state, action.index, {
        now: Date.now(),
        baseMs: cfg.queue.backoffBaseMs,
        maxMs: cfg.queue.backoffMaxMs,
        maxAttempts: cfg.queue.maxAttempts,
      });
      queueState.saveState(STATE_FILE, state);
      note(
        `Fallo al resolver ${item.name}: ${err.message} → ${
          attempt.failed ? 'descartado tras máximos intentos' : `reintento programado (intento ${attempt.attempts})`
        }`,
      );
    }
  } else if (action.type === 'wait') {
    note(`En espera: ${action.reason}`);
  } else if (action.type === 'none') {
    note('Cola terminada: todos los items en estado final');
  }
  return state;
}

function printStatus() {
  const state = queueState.loadState(STATE_FILE);
  const summary = queueState.summarize(state);
  console.log(`[PS5 SEQUENCER] Cola: ${summary.total} items | pendientes: ${summary.pending} | en curso: ${summary.injected} | completados: ${summary.completed} | fallidos: ${summary.failed} | saltados: ${summary.skipped}`);
  if (summary.next) console.log(`[PS5 SEQUENCER] Siguiente: ${summary.next}`);
  for (const item of state.items) {
    console.log(`  - [${item.status}] ${item.name}${item.note ? ` — ${item.note}` : ''}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--status')) {
    printStatus();
    return;
  }
  if (!acquirePid(PID_FILE)) {
    console.error(`[PS5 SEQUENCER] Ya hay una instancia viva (pidfile ${PID_FILE}). Saliendo.`);
    process.exit(1);
  }
  process.on('exit', () => releasePid(PID_FILE));
  const pollMs = cfg.queue.pollMs;
  console.log(`[PS5 SEQUENCER] Iniciado (ciclo cada ${pollMs / 1000}s). Estado: ${STATE_FILE}`);
  if (args.includes('--once')) {
    await cycle();
    process.exit(0);
  }
  await cycle();
  setInterval(() => {
    cycle().catch((err) => logPs5(TAG, `Error en ciclo: ${err.message}`, cfg.state.logFile));
  }, pollMs);
}

main().catch((err) => {
  console.error(`[PS5 SEQUENCER] ERROR FATAL: ${err.message}`);
  process.exit(1);
});
