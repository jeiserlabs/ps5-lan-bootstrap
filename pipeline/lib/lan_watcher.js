/**
 * @file lan_watcher.js
 * @description Vigilancia incremental de transferencia HTTP y verificación de instalación FTP en PS5.
 * SRP < 150L.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');
const { logPs5 } = require('./pipeline_log.js');
const { ps5HttpGet } = require('./ps5_client.js');
const { getPs5Config } = require('./config.js');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function tcpOpen(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    s.setTimeout(timeoutMs);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => { s.destroy(); resolve(false); });
  });
}

async function ensureFtpAlive(cfg = getPs5Config(), tag = 'LAN_INSTALLER', logFile = null) {
  const targetLog = logFile || (cfg.state && cfg.state.logFile ? path.join(path.dirname(cfg.state.logFile), 'lan_installer.log') : null);
  const alive = await tcpOpen(cfg.ps5.ip, 2121, 2000);
  if (!alive) {
    logPs5(tag, '⚠️ ftpsrv (2121) caído en PS5. Reactivando vía Payload Manager...', targetLog);
    await ps5HttpGet(`http://${cfg.ps5.ip}:8084/loadpayload:ftpsrv-ps5.elf`, 5000);
    await sleep(2500);
  }
}

function verifyFtpInstalled(titleId, category, contentId) {
  try {
    const pyScript = path.join(__dirname, '..', 'scripts', 'verify_installed_ftp.py');
    const args = [pyScript, titleId, category];
    if (contentId) args.push(contentId);
    const out = execFileSync('python', args, { encoding: 'utf8', timeout: 8000 });
    return out.trim() === 'OK';
  } catch {
    return false;
  }
}

async function waitForPkgTransfer(filename, expectedSize, titleId, category, contentId, cfg = getPs5Config(), tag = 'LAN_INSTALLER', logFile = null) {
  const targetLog = logFile || (cfg.state && cfg.state.logFile ? path.join(path.dirname(cfg.state.logFile), 'lan_installer.log') : null);
  const startedAt = Date.now();
  let lastRangeTime = Date.now();
  let lastEndByte = 0;
  let hasStarted = false;
  let lastReportedPct = -1;
  let readOffset = 0;
  try { readOffset = fs.statSync(cfg.state.logFile).size; } catch {}

  if (expectedSize < 20 * 1024 * 1024) {
    await sleep(2000);
  } else {
    for (let i = 0; i < 1080; i++) {
      await sleep(5000);
      try {
        if (fs.existsSync(cfg.state.logFile)) {
          const size = fs.statSync(cfg.state.logFile).size;
          if (size < readOffset) readOffset = 0;
          if (size > readOffset) {
            const fd = fs.openSync(cfg.state.logFile, 'r');
            let consumed = 0;
            try {
              const len = size - readOffset;
              const buf = Buffer.alloc(len);
              const bytes = fs.readSync(fd, buf, 0, len, readOffset);
              const chunk = buf.toString('utf8', 0, bytes);
              const nl = chunk.lastIndexOf('\n');
              const complete = nl === -1 ? '' : chunk.slice(0, nl + 1);
              consumed = nl === -1 ? 0 : nl + 1;
              const lines = complete.split('\n').filter((l) => l.includes(filename) && l.includes('[SERVER] RANGE'));
              if (lines.length > 0) {
                hasStarted = true;
                const lastLine = lines[lines.length - 1];
                const m = lastLine.match(/RANGE "bytes=(\d+)-(\d+)"/);
                if (m) {
                  const endByte = Number(m[2]);
                  if (endByte > lastEndByte) {
                    lastEndByte = endByte;
                    lastRangeTime = Date.now();
                    const pct = Math.floor((lastEndByte / expectedSize) * 100);
                    if (pct % 10 === 0 && pct !== lastReportedPct && pct < 100) {
                      lastReportedPct = pct;
                      logPs5(tag, `⏳ Progreso ${filename}: ${pct}% (${(lastEndByte / 1e9).toFixed(1)} / ${(expectedSize / 1e9).toFixed(1)} GB)`, targetLog);
                    }
                  }
                  if (expectedSize > 0 && endByte >= expectedSize - 0x400000) {
                    logPs5(tag, `📦 100% transferido (${(expectedSize / 1e9).toFixed(2)} GB). Consolidando en PS5...`, targetLog);
                    break;
                  }
                }
              }
            } finally {
              fs.closeSync(fd);
            }
            readOffset += consumed;
          }
        }
      } catch {}

      if (!hasStarted && Date.now() - startedAt > 120000) {
        logPs5(tag, `❌ La PS5 no solicitó ningún rango en 120s. Abortando.`, targetLog);
        return false;
      }

      if (hasStarted && Date.now() - lastRangeTime > 180000) {
        if (expectedSize > 0 && lastEndByte >= expectedSize * 0.98) {
          logPs5(tag, `Transferencia HTTP cesó con ${(lastEndByte / 1e9).toFixed(2)} GB (>=98%). Verificando...`, targetLog);
          break;
        }
        logPs5(tag, `❌ Transferencia estancada a los ${(lastEndByte / 1e9).toFixed(2)} GB. Abortando.`, targetLog);
        return false;
      }
    }
  }

  logPs5(tag, 'Esperando consolidación interna en PS5...', targetLog);
  for (let j = 0; j < 60; j++) {
    const res = await ps5HttpGet(`http://${cfg.ps5.ip}:${cfg.ps5.installPort}/api/status`, 3000);
    if (res && res.status === 200) {
      try {
        const state = JSON.parse(res.body);
        if (!state.busy && !state.pull) break;
      } catch {}
    }
    await sleep(2000);
  }

  await ensureFtpAlive(cfg, tag, targetLog);
  for (let v = 0; v < 24; v++) {
    const isOk = verifyFtpInstalled(titleId, category, contentId);
    if (isOk) {
      logPs5(tag, `🎯 VERIFICACIÓN FTP EXITOSA: [${titleId}] confirmado en PS5 (${category})`, targetLog);
      return true;
    }
    if (v === 4 || v === 12) await ensureFtpAlive(cfg, tag, targetLog);
    await sleep(2500);
  }

  logPs5(tag, `❌ VERIFICACIÓN FTP FALLÓ: [${titleId}] NO se encontró en PS5 (${category}).`, targetLog);
  return false;
}

module.exports = {
  tcpOpen,
  ensureFtpAlive,
  verifyFtpInstalled,
  waitForPkgTransfer,
};
