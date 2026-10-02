#!/usr/bin/env node
/**
 * @file install_watcher.js
 * @description Watcher en tiempo real para el pipeline de instalación PS5:
 *   - Monitoriza el progreso del stream LAN PC ➔ PS5 (bytes transferidos, %, MB/s, ETA).
 *   - Monitoriza las descargas activas en IDM (Update/DLCs).
 *   - Detecta fin de transferencia y verifica registro en la consola.
 * Uso:
 *   node scripts/install_watcher.js          # Muestra estado actual
 *   node scripts/install_watcher.js --watch  # Loop continuo de monitoreo cada 5s
 * SRP < 300L.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { getPs5Config } = require('../lib/config.js');
const { logPs5 } = require('../lib/pipeline_log.js');
const { acquirePid, releasePid } = require('../lib/pidfile.js');

const cfg = getPs5Config();
const TAG = 'INSTALL_WATCHER';
const PID_FILE = path.join(cfg.state.cacheDir, 'install_watcher.pid');
const STATUS_JSON = path.join(cfg.state.cacheDir, 'install_status.json');

/** @type {{ lastEnd: number, lastTime: number, speedMBs: number }} */
let speedState = { lastEnd: 0, lastTime: 0, speedMBs: 0 };

function getLiveTransfer() {
  const logFile = cfg.state.logFile;
  if (!fs.existsSync(logFile)) return null;

  let content = '';
  try {
    const fd = fs.openSync(logFile, 'r');
    const stat = fs.fstatSync(fd);
    const readSize = Math.min(stat.size, 32768);
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    fs.closeSync(fd);
    content = buf.toString('utf8');
  } catch {
    return null;
  }

  const lines = content.trim().split('\n');
  const rangeLines = lines.filter((l) => l.includes('[SERVER] RANGE'));
  if (rangeLines.length === 0) return null;

  const lastLine = rangeLines[rangeLines.length - 1];
  const timeMatch = lastLine.match(/^\[(.*?)\]/);
  const rangeMatch = lastLine.match(/RANGE "bytes=(\d+)-(\d+)"/);
  const fileMatch = lastLine.match(/—\s+(.*?)$/);

  if (!rangeMatch || !fileMatch) return null;

  const timestamp = timeMatch ? new Date(timeMatch[1]).getTime() : Date.now();
  const startByte = Number(rangeMatch[1]);
  const endByte = Number(rangeMatch[2]);
  const filename = fileMatch[1].trim();

  // Buscar tamaño total del archivo en bibliotecas
  let totalBytes = 0;
  for (const dir of cfg.paths.libraryDirs) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) {
      try {
        totalBytes = fs.statSync(p).size;
        break;
      } catch {}
    }
  }

  const now = Date.now();
  if (now - timestamp > 120000) return null;
  const isStalled = now - timestamp > 45000;

  // Cálculo de velocidad instantánea
  if (speedState.lastTime > 0 && timestamp > speedState.lastTime && endByte > speedState.lastEnd) {
    const dt = (timestamp - speedState.lastTime) / 1000;
    const db = (endByte - speedState.lastEnd) / (1024 * 1024);
    if (dt > 0.5 && dt < 30) {
      speedState.speedMBs = Math.round((db / dt) * 10) / 10;
    }
  } else if (rangeLines.length >= 4) {
    const prevLine = rangeLines[Math.max(0, rangeLines.length - 6)];
    const prevTimeM = prevLine.match(/^\[(.*?)\]/);
    const prevRangeM = prevLine.match(/RANGE "bytes=(\d+)-(\d+)"/);
    if (prevTimeM && prevRangeM) {
      const prevT = new Date(prevTimeM[1]).getTime();
      const prevEnd = Number(prevRangeM[2]);
      const dt = (timestamp - prevT) / 1000;
      const db = (endByte - prevEnd) / (1024 * 1024);
      if (dt > 0.5 && dt < 60) {
        speedState.speedMBs = Math.round((db / dt) * 10) / 10;
      }
    }
  }
  speedState.lastEnd = endByte;
  speedState.lastTime = timestamp;

  const transferredGB = (endByte / (1024 ** 3)).toFixed(2);
  const totalGB = totalBytes > 0 ? (totalBytes / (1024 ** 3)).toFixed(2) : '?';
  const percent = totalBytes > 0 ? ((endByte / totalBytes) * 100).toFixed(1) : '?';

  let etaMin = '?';
  if (totalBytes > 0 && speedState.speedMBs > 0) {
    const remainingMB = (totalBytes - endByte) / (1024 * 1024);
    etaMin = Math.round(remainingMB / speedState.speedMBs / 60);
  }

  return {
    filename,
    startByte,
    endByte,
    transferredGB: Number(transferredGB),
    totalGB: totalGB !== '?' ? Number(totalGB) : null,
    percent: percent !== '?' ? Number(percent) : null,
    speedMBs: speedState.speedMBs,
    etaMinutes: etaMin !== '?' ? etaMin : null,
    isStalled,
    lastUpdateMs: now - timestamp,
  };
}

const { execSync } = require('node:child_process');

function parseHex(h) {
  if (!h || h.trim().length < 16) return 0;
  try {
    const buf = Buffer.from(h.trim(), 'hex');
    return Number(buf.readBigUInt64LE(0));
  } catch {
    return 0;
  }
}

function getIdmStatus() {
  const items = [];
  try {
    const qOut = execSync('reg query HKCU\\Software\\DownloadManager\\Queue /v Queue', { encoding: 'utf8', timeout: 2000 });
    const qM = qOut.match(/Queue\s+REG_SZ\s+(.*)$/m);
    const queueIds = qM ? qM[1].trim().split(/\s+/).filter(Boolean) : [];

    for (let i = 0; i < queueIds.length; i++) {
      const id = queueIds[i];
      try {
        const out = execSync(`reg query HKCU\\Software\\DownloadManager\\${id}`, { encoding: 'utf8', timeout: 1500 });
        const fnM = out.match(/^\s+FR_FNCD\s+REG_SZ\s+(.*)$/m);
        const fileM = out.match(/^\s+FileName\s+REG_SZ\s+(.*)$/m);
        let name = '';
        if (fnM && fnM[1].trim()) {
          name = decodeURIComponent(fnM[1].trim());
        } else if (fileM && fileM[1].trim()) {
          let raw = decodeURIComponent(fileM[1].split('?')[0].trim());
          const h = raw.indexOf('-');
          if (h > 0 && h < 30) raw = raw.substring(h + 1);
          name = raw;
        } else {
          name = `Descarga #${id}`;
        }

        const fsM = out.match(/^\s+FileSize\s+REG_NONE\s+(.*)$/m);
        const dlM = out.match(/^\s+Downloaded\s+REG_NONE\s+(.*)$/m);
        const stM = out.match(/^\s+Status\s+REG_DWORD\s+0x([0-9a-fA-F]+)/m);
        const spM = out.match(/^\s+Speed\s+REG_DWORD\s+0x([0-9a-fA-F]+)/m);

        const totalBytes = fsM ? parseHex(fsM[1]) : 0;
        const downBytes = dlM ? parseHex(dlM[1]) : 0;
        const status = stM ? parseInt(stM[1], 16) : 0;
        const speedBytes = spM ? parseInt(spM[1], 16) : 0;

        const totalGB = totalBytes > 0 ? (totalBytes / (1024 ** 3)).toFixed(2) : null;
        const downGB = (downBytes / (1024 ** 3)).toFixed(2);
        const pct = totalBytes > 0 ? ((downBytes / totalBytes) * 100).toFixed(1) : '0.0';
        const speedMBs = speedBytes > 0 ? (speedBytes / (1024 * 1024)).toFixed(2) : '0';

        items.push({
          id,
          pos: i + 1,
          totalInQueue: queueIds.length,
          name,
          totalGB: totalGB ? Number(totalGB) : null,
          downGB: Number(downGB),
          percent: Number(pct),
          speedMBs: Number(speedMBs),
          status,
          active: status === 1,
        });
      } catch {}
    }
  } catch {}
  return items;
}

function formatStatus() {
  const transfer = getLiveTransfer();
  const idm = getIdmStatus();

  const lines = [];
  lines.push('========================================================================');
  lines.push(' 🎮 WATCHER DEL PIPELINE DE INSTALACIÓN PS5');
  lines.push('========================================================================');

  if (transfer) {
    const statusIcon = transfer.isStalled ? '⚠️ ESTANCADO' : '🚀 TRANSFIRIENDO';
    lines.push(`📡 Stream LAN PC ➔ PS5: [${statusIcon}]`);
    lines.push(`   ├─ Archivo: ${transfer.filename}`);
    lines.push(`   ├─ Progreso: ${transfer.transferredGB} GB / ${transfer.totalGB} GB (${transfer.percent}%)`);
    lines.push(`   ├─ Velocidad: ${transfer.speedMBs > 0 ? transfer.speedMBs + ' MB/s' : 'Calculando...'}`);
    lines.push(`   └─ ETA estimado: ${transfer.etaMinutes ? transfer.etaMinutes + ' min' : 'Calculando...'}`);
  } else {
    lines.push('📡 Stream LAN PC ➔ PS5: ⏳ [EN ESPERA] Auto-instalación 1x1 programada al completar descargas');
  }

  lines.push('------------------------------------------------------------------------');
  if (idm.length > 0) {
    const activeCount = idm.filter((x) => x.active).length;
    lines.push(`📥 Cola de descargas en IDM: (${idm.length} en cola | ${activeCount} descargando)`);
    for (const d of idm) {
      const icon = d.active ? '⚡' : '⏸️';
      const totStr = d.totalGB ? ` / ${d.totalGB} GB` : '';
      const pctStr = d.percent > 0 ? ` (${d.percent}%)` : '';
      const spdStr = d.speedMBs > 0 ? ` | ${d.speedMBs} MB/s` : '';
      const stateStr = d.active ? 'Descargando' : 'En cola';
      lines.push(`   ├─ ${icon} [${d.pos}/${d.totalInQueue}] ${d.name}`);
      lines.push(`   │     Progreso: ${d.downGB} GB${totStr}${pctStr}${spdStr} — [${stateStr}]`);
    }
  } else {
    lines.push('📥 Cola de descargas en IDM: Vacía');
  }
  lines.push('========================================================================');

  return { summary: lines.join('\n'), data: { transfer, idm, updatedAt: new Date().toISOString() } };
}

function main() {
  const isWatch = process.argv.includes('--watch');

  if (!isWatch) {
    const { summary } = formatStatus();
    console.log(summary);
    return;
  }

  if (!acquirePid(PID_FILE)) {
    console.error(`[${TAG}] Ya hay un watcher activo (pidfile ${PID_FILE}).`);
    process.exit(1);
  }

  process.on('exit', () => releasePid(PID_FILE));
  process.on('SIGINT', () => {
    console.log('\nCerrando watcher...');
    process.exit(0);
  });

  console.clear();
  console.log('[WATCHER INICIADO] Presiona Ctrl+C para salir.\n');

  setInterval(() => {
    const { summary, data } = formatStatus();
    try {
      fs.mkdirSync(path.dirname(STATUS_JSON), { recursive: true });
      fs.writeFileSync(STATUS_JSON, JSON.stringify(data, null, 2) + '\n');
    } catch {}
    console.clear();
    console.log(summary);
  }, 5000);
}

main();
