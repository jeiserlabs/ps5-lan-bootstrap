#!/usr/bin/env node
/**
 * @file kstuff_watchdog.js
 * @description Centinela PC→PS5: detecta la degradación del jailbreak a media sesión
 *   (kstuff pausado/descargado, pkg-receiver muerto tras un crash de juego) y la
 *   recarga en caliente vía Payload Manager (:8084). Avisa por Telegram.
 *   Causa histórica: SM+ pausaba kstuff al lanzar un juego (kstuff_game_auto_toggle=1)
 *   y un crash lo dejaba pausado para siempre. Fix en consola (config.ini) + este watchdog.
 * Uso: node scripts/kstuff_watchdog.js [--once | --status]
 * Notas 3-oct: rutas reales de payloads (list_payloads), resultado por payload, salud de
 *   elfldr (9021), presupuesto por sesión de jailbreak, inmune a excepciones no capturadas.
 * SRP < 300L. Cero dependencias externas.
 */
'use strict';

const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { getPs5Config } = require('../lib/config.js');
const { logPs5 } = require('../lib/pipeline_log.js');
const { acquirePid, releasePid } = require('../lib/pidfile.js');
const { sendTelegramMessage } = require('../lib/telegram.js');

const cfg = getPs5Config();
const TAG = 'KSTUFF_WATCHDOG';
const PID_FILE = path.join(cfg.state.cacheDir, 'kstuff_watchdog.pid');
const LOG_FILE = path.join(path.dirname(cfg.state.logFile), 'kstuff_watchdog.log');
const STATE_FILE = path.join(cfg.state.cacheDir, 'kstuff_watchdog_state.json');

const POLL_MS = Number(process.env.PS5_WATCHDOG_POLL_MS || 60000);
const REPAIR_COOLDOWN_MS = 10 * 60 * 1000; // 1 intento de reparación cada 10 min
const MAX_REPAIRS_PER_SESSION = 8; // por sesión de jailbreak (se resetea si la consola reinicia)
const LIMIT_LOG_EVERY_MS = 60 * 60 * 1000; // sin presupuesto: avisar en el log solo 1 vez por hora

/** Cadena canónica; el Payload Manager a veces devuelve config vacía un instante (glitch observado 3-oct). */
const CANONICAL_AUTOLOAD = 'kstuff.elf,elfldr-ps5.elf,pkg-receiver.elf,ftpsrv-ps5.elf,shadowmountplus.elf';

/** Rutas REALES dentro de la consola (verificadas por /list_payloads y FTP el 3-oct).
 *  El dir interno NO se llama igual que el .elf: ftpsrv/ftpsrv-ps5.elf, elfldr/elfldr-ps5.elf, etc. */
const PAYLOAD_PATHS = {
  'kstuff.elf': '/data/pldmgr/payloads/kstuff/kstuff.elf',
  'elfldr-ps5.elf': '/data/pldmgr/payloads/elfldr/elfldr-ps5.elf',
  'pkg-receiver.elf': '/data/pldmgr/payloads/pkg-receiver/pkg-receiver.elf',
  'ftpsrv-ps5.elf': '/data/pldmgr/payloads/ftpsrv/ftpsrv-ps5.elf',
  'shadowmountplus.elf': '/data/pldmgr/payloads/shadowmountplus/shadowmountplus.elf',
};

const PMGR = `http://${cfg.ps5.ip}:8084`; // Payload Manager
const PKG_RCV = `http://${cfg.ps5.ip}:${cfg.ps5.installPort}/api/status`;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGet(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

function tcpOpen(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (v) => {
      s.destroy();
      resolve(v);
    };
    s.setTimeout(timeoutMs);
    s.on('connect', () => done(true));
    s.on('timeout', () => done(false));
    s.on('error', () => done(false));
  });
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { repairsDate: '', repairsCount: 0, lastRepairMs: 0, lastLimitLogMs: 0, ps5WasOnline: true };
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');
  } catch {}
}

/**
 * Lanza un payload vía Payload Manager. Ruta completa primero (forma verificada que
 * devuelve HTTP 200); el nombre corto como fallback. HTTP 200 = aceptado.
 */
async function loadPayload(name) {
  const full = PAYLOAD_PATHS[name] || `/data/pldmgr/payloads/${name}/${name}`;
  const res = await httpGet(`${PMGR}/loadpayload:${full}`, 10000);
  if (res && res.status === 200) return true;
  const res2 = await httpGet(`${PMGR}/loadpayload:${name}`, 10000);
  return Boolean(res2 && res2.status === 200);
}

async function pkgReceiverAlive() {
  const res = await httpGet(PKG_RCV, 4000);
  if (!res || res.status !== 200) return false;
  try {
    const j = JSON.parse(res.body);
    return typeof j.busy === 'boolean';
  } catch {
    return false;
  }
}

function httpPostJson(url, obj, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(obj);
    const req = http.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode || 0, body }));
      }
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
    req.end(payload);
  });
}

/**
 * Verifica que el autoload de la consola tenga la cadena canónica; la restaura si está
 * vacía o podada (glitch observado: get_config devolvió lista vacía con payloads vivos).
 * @param {(m: string) => void} log
 * @returns {Promise<boolean>} true si quedó consistente
 */
async function ensureAutoloadConfig(log) {
  const res = await httpGet(`${PMGR}/get_config`, 4000);
  if (!res || res.status !== 200) return false;
  let list = '';
  try {
    list = String(JSON.parse(res.body).AUTOLOAD_LIST || '');
  } catch {
    return false;
  }
  const missing = CANONICAL_AUTOLOAD.split(',').filter((p) => !list.split(',').includes(p));
  if (missing.length === 0) return true;

  // Reintento de lectura antes de escribir: evita pisar config buena por una respuesta cortada.
  await sleep(3000);
  const retry = await httpGet(`${PMGR}/get_config`, 4000);
  let retryList = '';
  try {
    retryList = String(JSON.parse((retry && retry.body) || '{}').AUTOLOAD_LIST || '');
  } catch {}
  const stillMissing = CANONICAL_AUTOLOAD.split(',').filter((p) => !retryList.split(',').includes(p));
  if (stillMissing.length === 0) return true;

  log(`⚠️ AUTOLOAD_LIST incompleta en la consola (faltan: ${stillMissing.join(', ')}). Restaurando...`);
  const set = await httpPostJson(`${PMGR}/set_config`, { AUTOLOAD_LIST: CANONICAL_AUTOLOAD });
  const ok = Boolean(set && /ok/i.test(set.body || ''));
  if (ok) {
    log('✅ AUTOLOAD_LIST restaurada a la cadena canónica.');
    sendTelegramMessage('🔧 <b>Watchdog PS5:</b> la cadena de autoload estaba incompleta en la consola; la restauré automáticamente.');
  } else {
    log('❌ No se pudo restaurar AUTOLOAD_LIST (set_config falló).');
  }
  return ok;
}

async function repairCycle(state, log) {
  const today = new Date().toISOString().slice(0, 10);
  if (state.repairsDate !== today) {
    state.repairsDate = today;
    state.repairsCount = 0;
  }
  if (state.repairsCount >= MAX_REPAIRS_PER_SESSION) {
    if (Date.now() - (state.lastLimitLogMs || 0) > LIMIT_LOG_EVERY_MS) {
      state.lastLimitLogMs = Date.now();
      log(`Sin presupuesto de reparaciones en esta sesión (${MAX_REPAIRS_PER_SESSION}). Se resetea si la consola reinicia.`);
      saveState(state);
    }
    return false;
  }
  if (Date.now() - state.lastRepairMs < REPAIR_COOLDOWN_MS) return false;

  state.lastRepairMs = Date.now();
  state.repairsCount += 1;
  log(`⚠️ Degradación detectada. Relanzando payloads (intento ${state.repairsCount}/${MAX_REPAIRS_PER_SESSION} de la sesión)...`);
  sendTelegramMessage(
    `🛠️ <b>Watchdog PS5:</b> servicios caídos en consola. Relanzando vía Payload Manager (intento ${state.repairsCount}/${MAX_REPAIRS_PER_SESSION} de la sesión)...`
  );

  const results = {};
  for (const name of ['kstuff.elf', 'pkg-receiver.elf', 'ftpsrv-ps5.elf', 'elfldr-ps5.elf']) {
    results[name] = await loadPayload(name);
    await sleep(4000);
  }
  log(`loadpayload → ${Object.entries(results).map(([n, r]) => `${n}=${r ? 'ok' : 'FALLÓ'}`).join(' ')}`);

  const ok = await pkgReceiverAlive();
  const ftpOk = await tcpOpen(cfg.ps5.ip, 2121, 5000);
  const elfOk = await tcpOpen(cfg.ps5.ip, cfg.ps5.elfldrPort, 3000);
  saveState(state);

  if (ok && ftpOk) {
    log(`✅ Recuperación: pkg-receiver y ftpsrv responden (elfldr=${elfOk ? 'ok' : 'caído'}).`);
    sendTelegramMessage('✅ <b>Watchdog PS5:</b> jailbreak y servicios LAN recuperados (12800 y 2121 activos).');
  } else {
    log(`⚠️ Recuperación parcial: pkg-receiver=${ok ? 'ok' : 'CAÍDO'} ftpsrv=${ftpOk ? 'ok' : 'CAÍDO'}.`);
    sendTelegramMessage(
      `⚠️ <b>Watchdog PS5:</b> la reparación NO fue completa (pkg-receiver=${ok ? 'ok' : 'CAÍDO'}, ftpsrv=${ftpOk ? 'ok' : 'CAÍDO'}).\n` +
        'Si los juegos no abren: cerrar el juego y relanzar <b>WebKit Autoloader</b>.'
    );
  }
  return ok && ftpOk;
}

async function sweep(state, log) {
  // 1) ¿Payload Manager vivo? (la sesión de la consola sigue activa)
  const pmgr = await httpGet(`${PMGR}/version`, 4000);
  const ps5Online = Boolean(pmgr && pmgr.status === 200);

  if (!ps5Online) {
    if (state.ps5WasOnline) {
      state.ps5WasOnline = false;
      log('PS5 sin sesión de jailbreak (8084 no responde). Esperando a que se lance el Autoloader...');
      sendTelegramMessage(
        '💤 <b>Watchdog PS5:</b> la consola no tiene el jailbreak activo (¿reiniciada o en reposo profundo?).\n' +
          'Cuando enciendas: abrir <b>WebKit Autoloader</b> — la cadena carga sola.'
      );
    }
    return;
  }
  if (!state.ps5WasOnline) {
    state.ps5WasOnline = true;
    log('PS5 de vuelta: Payload Manager responde.');
    if (state.repairsCount >= MAX_REPAIRS_PER_SESSION) {
      state.repairsCount = 0; // sesión nueva de jailbreak = presupuesto nuevo
      log('Presupuesto de reparaciones reiniciado (nueva sesión de jailbreak).');
    }
  }

  // 2) Config de autoload intacta (autoreparación silenciosa)
  await ensureAutoloadConfig(log);

  // 3) Salud de los payloads críticos (12800 instalación, 2121 FTP, 9021 elfldr)
  const receiverOk = await pkgReceiverAlive();
  const ftpOk = await tcpOpen(cfg.ps5.ip, 2121, 5000);
  const elfOk = await tcpOpen(cfg.ps5.ip, cfg.ps5.elfldrPort, 3000);
  if (receiverOk && ftpOk && elfOk) return; // todo bien, silencio

  log(
    `Salud degradada: pkg-receiver=${receiverOk ? 'ok' : 'CAÍDO'} ftpsrv=${ftpOk ? 'ok' : 'CAÍDO'} elfldr=${elfOk ? 'ok' : 'CAÍDO'}`
  );
  await repairCycle(state, log);
}

async function main() {
  const log = (m) => logPs5(TAG, m, LOG_FILE);

  if (process.argv.includes('--status')) {
    const s = loadState();
    console.log(JSON.stringify({ ...s, pid: require('../lib/pidfile.js').readAlivePid(PID_FILE) }, null, 2));
    return;
  }

  const once = process.argv.includes('--once');
  if (!once && !acquirePid(PID_FILE)) {
    log('Ya hay un watchdog vivo (pidfile). Saliendo.');
    return;
  }

  // Supervivencia: ningún error no capturado mata al centinela (causa histórica de
  // watchdog muerto con pidfile huérfano desde las 11:41 del 3-oct). Se registra y sigue.
  process.on('uncaughtException', (err) => log(`Excepción neutralizada: ${err && err.message}`));
  process.on('unhandledRejection', (err) => log(`Rechazo neutralizado: ${err && (err.message || err)}`));

  const state = loadState();
  log(once ? 'Barrido único (--once).' : `Watchdog iniciado (poll ${POLL_MS / 1000}s, PID ${process.pid}).`);

  try {
    if (once) {
      await sweep(state, log);
    } else {
      for (;;) {
        try {
          await sweep(state, log);
        } catch (err) {
          log(`Error en barrido: ${err && err.message}`);
        }
        saveState(state);
        await sleep(POLL_MS);
      }
    }
  } finally {
    saveState(state);
    if (!once) releasePid(PID_FILE);
  }
}

main().catch((e) => {
  logPs5(TAG, `Fatal: ${e && e.message}`, LOG_FILE);
  process.exitCode = 1;
});
