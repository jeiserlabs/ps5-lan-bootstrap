/**
 * @file idm_healer.js
 * @description Centinela Autónomo Anti-Microcortes de IDM.
 *   Supervisa actividad de escritura y conectividad externa.
 *   Si detecta estancamiento por microcorte/DNS flap, relanza la cola automáticamente.
 * SRP < 180L.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { isStalled, hasQueuedTasks, checkInternetReachability, decideHealerAction } = require('../lib/healer_engine');

const IDM_EXE = 'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe';
const IDM_TEMP_DIR = 'C:\\Users\\dev\\AppData\\Roaming\\IDM\\DwnlData\\dev';
const LOG_FILE = path.join(__dirname, '..', '..', 'data', 'logs', 'idm_healer.log');
const ENV_PATH = 'e:\\PROYECTOS\\Mis_Proyectos\\Asistente_Personal\\.env';

let lastKickTime = Date.now();
const COOLDOWN_SEC = 60;
const CHECK_INTERVAL_MS = 20000;

function log(msg) {
  const line = `[${new Date().toISOString()}] [IDM_HEALER] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}

function sendTelegramAlert(text) {
  try {
    if (!fs.existsSync(ENV_PATH)) return;
    const content = fs.readFileSync(ENV_PATH, 'utf8');
    const tokenMatch = content.match(/TELEGRAM_BOT_TOKEN=([^\r\n]+)/);
    const chatMatch = content.match(/TELEGRAM_CHAT_ID=([^\r\n]+)/);
    if (!tokenMatch || !chatMatch) return;

    const https = require('https');
    const payload = JSON.stringify({ chat_id: chatMatch[1].trim(), text, parse_mode: 'Markdown' });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${tokenMatch[1].trim()}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    });
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch {}
}

function getChunkAgesSec() {
  const ages = [];
  const now = Date.now();
  if (!fs.existsSync(IDM_TEMP_DIR)) return ages;

  try {
    const folders = fs.readdirSync(IDM_TEMP_DIR);
    for (const f of folders) {
      const full = path.join(IDM_TEMP_DIR, f);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          const files = fs.readdirSync(full);
          for (const file of files) {
            const fstat = fs.statSync(path.join(full, file));
            ages.push((now - fstat.mtimeMs) / 1000);
          }
        }
      } catch {}
    }
  } catch {}
  return ages;
}

function getQueueString() {
  try {
    const out = execSync('reg query "HKCU\\Software\\DownloadManager\\Queue" /v Queue', { encoding: 'utf8' });
    const m = out.match(/Queue\s+REG_SZ\s+([^\r\n]+)/i);
    return m ? m[1].trim() : '';
  } catch {
    return '';
  }
}

async function cycle() {
  try {
    const queueStr = getQueueString();
    const hasQueue = hasQueuedTasks(queueStr);
    const chunkAges = getChunkAgesSec();
    const stalled = isStalled(chunkAges, 45);
    const timeSinceLastKickSec = (Date.now() - lastKickTime) / 1000;

    let internetOk = false;
    if (stalled && hasQueue) {
      internetOk = await checkInternetReachability('https://1.1.1.1', 3000);
      if (!internetOk) {
        internetOk = await checkInternetReachability('https://www.google.com', 3000);
      }
    }

    const action = decideHealerAction({
      stalled,
      hasQueue,
      internetOk,
      timeSinceLastKickSec
    }, COOLDOWN_SEC);

    if (action === 'KICK_RESUME') {
      log('⚠️ Micro-corte / estancamiento detectado (>45s inactivo). Internet verificado OK.');
      log('⚡ Reanudando cola IDM automáticamente...');
      lastKickTime = Date.now();
      try {
        spawn(IDM_EXE, ['/s'], { detached: true, stdio: 'ignore' }).unref();
        log('✅ Comando IDM /s ejecutado con éxito.');
        sendTelegramAlert('🔄 *[AUTO-HEALER]* Micro-corte de red detectado y superado. Cola IDM reanudada automáticamente.');
      } catch (e) {
        log(`❌ Error al ejecutar IDM: ${e.message}`);
      }
    } else if (action === 'WAIT_INTERNET') {
      log('⏳ Descargas estancadas y sin internet. Esperando restablecimiento de red...');
    }
  } catch (err) {
    log(`Error en ciclo: ${err.message}`);
  }
}

log('Centinela Anti-Microcortes IDM activado. Intervalo: 20s, Cooldown: 60s.');
setInterval(cycle, CHECK_INTERVAL_MS);
cycle();
