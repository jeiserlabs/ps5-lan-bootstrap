#!/usr/bin/env node
/**
 * @file idm_watcher.js
 * @description Daemon centinela IDM: relanza IDM, descomprime RARs en Desktop,
 *   audita PKGs (7 barreras), organiza en biblioteca y auto-dispara LAN installer.
 * SRP < 300L.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync, spawn } = require('node:child_process');
const { validatePkg } = require('../lib/pkg_validator.js');
const { getPs5Config } = require('../lib/config.js');
const { logPs5 } = require('../lib/pipeline_log.js');
const { acquirePid, releasePid } = require('../lib/pidfile.js');
const { extractArchive, cleanupArchiveVolumes, inspectMultiPart } = require('../lib/archive_extractor.js');
const { resolveGameFolder, moveFileToGameFolder } = require('../lib/library_organizer.js');

const cfg = getPs5Config();
const WATCH_DIRS = Array.from(new Set([
  cfg.paths.watchDir,
  'E:\\',
  'C:\\Users\\dev\\Desktop',
  'C:\\Users\\dev\\Downloads\\Compressed',
  'C:\\Users\\dev\\Downloads',
].filter((d) => d && fs.existsSync(d))));
const TARGET_DIR = cfg.paths.libraryDirs[0];
const STAGING_DIR = path.join(TARGET_DIR, '_staging');
const PID_FILE = path.join(cfg.state.cacheDir, 'idm_watcher.pid');
const LOG_FILE = path.join(path.dirname(cfg.state.logFile), 'idm_watcher.log');
const TAG = 'IDM_WATCHER';

/** @type {Map<string, number>} */
const lastSizes = new Map();
/** @type {Set<string>} */
const processed = new Set();

function ensureIdmAlive() {
  try {
    const stdout = execSync('tasklist /FI "IMAGENAME eq IDMan.exe" /NH', { encoding: 'utf8' });
    if (!stdout.toLowerCase().includes('idman.exe')) {
      logPs5(TAG, '⚠️ IDM cerrado. Guardián auto-relanzando con /s...', LOG_FILE);
      if (fs.existsSync(cfg.paths.idmExe)) {
        spawn(cfg.paths.idmExe, ['/s'], { detached: true, stdio: 'ignore' }).unref();
      }
    }
  } catch {}
}

function isFileLocked(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r+');
    fs.closeSync(fd);
    return false;
  } catch {
    return true;
  }
}

function getExpectedSize(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(0x420);
    const readBytes = fs.readSync(fd, buf, 0, 0x420, 0);
    fs.closeSync(fd);
    if (readBytes >= 0x420 && buf.readUInt32BE(0) === 0x7f434e54) {
      return Number(buf.readBigUInt64BE(0x418));
    }
  } catch {}
  return 0;
}

/**
 * Procesa y audita un archivo .pkg validado.
 * @param {string} fullPath Ruta del archivo PKG
 * @param {string} filename Nombre del archivo
 */
function handlePkgFile(fullPath, filename) {
  logPs5(TAG, `🔍 Inicio de auditoría forense sobre: ${filename}`, LOG_FILE);
  const result = validatePkg(fullPath);

  if (result.valid) {
    const sizeGb = (result.info.sizeBytes / (1024 ** 3)).toFixed(2);
    logPs5(TAG, `✅ APROBADO: [${result.info.titleId}] ${result.info.title} (${sizeGb} GB) es 100% ÍNTEGRO`, LOG_FILE);
    const gameFolder = resolveGameFolder(TARGET_DIR, result.info.title, result.info.titleId);
    const moveRes = moveFileToGameFolder(fullPath, gameFolder, LOG_FILE);
    if (moveRes.success) {
      processed.add(filename);
      lastSizes.delete(filename);
    }
  } else {
    logPs5(TAG, `❌ RECHAZADO: ${filename} fallo validacion: ${result.errors.join('; ')}`, LOG_FILE);
    try { fs.renameSync(fullPath, `${fullPath}.corrupt`); } catch {}
    processed.add(filename);
    lastSizes.delete(filename);
  }
}

const lastRarAttempt = new Map();
let isExtracting = false;
let lastExtractionFinishedAt = 0;

function isAnyFileBusy(current) {
  for (const d of WATCH_DIRS) {
    try {
      for (const f of fs.readdirSync(d)) {
        if (f !== current && (f.endsWith('.pkg') || f.endsWith('.rar')) && isFileLocked(path.join(d, f))) return true;
      }
    } catch {}
  }
  return false;
}

function findStagedPkgs(dir) {
  const list = [];
  try {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) list.push(...findStagedPkgs(full));
      else if (ent.name.toLowerCase().endsWith('.pkg')) list.push(full);
    }
  } catch {}
  return list;
}

function handleRarArchive(fullPath, filename) {
  const multi = inspectMultiPart(filename);
  if (multi.isMultiPart && multi.partNum !== 1) return;
  if (isExtracting || Date.now() - lastExtractionFinishedAt < 15000) return;
  if (isAnyFileBusy(filename)) {
    logPs5(TAG, `⏳ IDM reconstruyendo/escribiendo. Descompresión de ${filename} en espera...`, LOG_FILE);
    return;
  }

  const lastAttempt = lastRarAttempt.get(filename) || 0;
  if (Date.now() - lastAttempt < 60000) return;
  lastRarAttempt.set(filename, Date.now());

  isExtracting = true;
  try {
    logPs5(TAG, `📦 Descompresión segura (1x1, carga balanceada <= 2 hilos): ${filename}...`, LOG_FILE);
    const extRes = extractArchive(fullPath, STAGING_DIR, LOG_FILE);
    if (!extRes.success) {
      logPs5(TAG, `⚠️ Descompresión pendiente: ${extRes.error}`, LOG_FILE);
      return;
    }
    const stagedPkgs = findStagedPkgs(STAGING_DIR);
    for (const pkgPath of stagedPkgs) handlePkgFile(pkgPath, path.basename(pkgPath));
    if (stagedPkgs.length > 0) {
      cleanupArchiveVolumes(fullPath, LOG_FILE);
      processed.add(filename);
      lastSizes.delete(filename);
      try { fs.rmSync(STAGING_DIR, { recursive: true, force: true }); } catch {}
    }
  } finally {
    isExtracting = false;
    lastExtractionFinishedAt = Date.now();
  }
}

function checkNewFiles() {
  ensureIdmAlive();

  for (const watchDir of WATCH_DIRS) {
    let entries = [];
    try {
      entries = fs.readdirSync(watchDir);
    } catch (err) {
      logPs5(TAG, `Error leyendo ${watchDir}: ${err.message}`, LOG_FILE);
      continue;
    }

    for (const file of entries) {
      const lower = file.toLowerCase();
      const isPkg = lower.endsWith('.pkg');
      const isRar = lower.endsWith('.rar');
      if (!isPkg && !isRar) continue;
      if (processed.has(file)) continue;

      const fullPath = path.join(watchDir, file);
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      // 1. Detección de estabilidad de archivo (evitar procesar mientras IDM escribe)
      const locked = isFileLocked(fullPath);
      const prevSize = lastSizes.get(file) || 0;
      const now = Date.now();
      const timeSinceMod = now - stat.mtimeMs;
      const expectedSize = isPkg ? getExpectedSize(fullPath) : 0;

      if (locked || stat.size !== prevSize || (expectedSize > 0 && stat.size < expectedSize) || timeSinceMod < 45000) {
        lastSizes.set(file, stat.size);
        const sizeGb = (stat.size / (1024 ** 3)).toFixed(2);
        const expStr = expectedSize > 0 ? ` / ${(expectedSize / (1024 ** 3)).toFixed(2)} GB` : '';
        logPs5(TAG, `IDM escribiendo: ${file} [${sizeGb}${expStr}] (locked: ${locked})... esperando`, LOG_FILE);
        continue;
      }

      // 2. Archivo completado y estabilizado
      if (isRar) {
        handleRarArchive(fullPath, file);
      } else if (isPkg) {
        handlePkgFile(fullPath, file);
      }
    }
  }

  checkIdmEvents();
  checkAutoTransition();
}

/** @type {Set<string>} */
const idmNotified = new Set();

function checkIdmEvents() {
  try {
    const qOut = execSync('reg query HKCU\\Software\\DownloadManager', { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8', timeout: 1500 });
    const matches = qOut.match(/DownloadManager\\(\d+)/g) || [];
    for (const m of matches) {
      const id = m.split('\\').pop();
      if (idmNotified.has(id)) continue;
      try {
        const out = execSync(`reg query HKCU\\Software\\DownloadManager\\${id} /v Status`, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8', timeout: 1000 });
        const stM = out.match(/Status\s+REG_DWORD\s+0x([0-9a-fA-F]+)/);
        if (stM && parseInt(stM[1], 16) === 3) {
          idmNotified.add(id);
          let name = `Descarga #${id}`;
          try {
            const fnOut = execSync(`reg query HKCU\\Software\\DownloadManager\\${id} /v FileName`, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8', timeout: 1000 });
            const fnM = fnOut.match(/FileName\s+REG_SZ\s+(.*)$/m);
            if (fnM) name = fnM[1].trim().split('?')[0];
          } catch {}
          logPs5(TAG, `🎉 IDM completó descarga: ${name}`, LOG_FILE);
        }
      } catch {}
    }
  } catch {}
}

let lanInstallerStarted = false;

function checkAutoTransition() {
  if (lanInstallerStarted) return;
  try {
    const qOut = execSync('reg query HKCU\\Software\\DownloadManager\\Queue /v Queue', { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8', timeout: 2000 });
    const qM = qOut.match(/Queue\s+REG_SZ\s+(.*)$/m);
    const queueIds = qM ? qM[1].trim().split(/\s+/).filter(Boolean) : [];
    if (queueIds.length === 0) return;
    for (const id of queueIds) {
      const out = execSync(`reg query HKCU\\Software\\DownloadManager\\${id} /v Status`, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8', timeout: 1500 });
      const stM = out.match(/Status\s+REG_DWORD\s+0x([0-9a-fA-F]+)/m);
      const st = stM ? parseInt(stM[1], 16) : 0;
      if (st !== 3 && st !== 5) return;
    }
  } catch { return; }

  for (const dir of WATCH_DIRS) {
    try {
      for (const f of fs.readdirSync(dir)) {
        const l = f.toLowerCase();
        if ((l.endsWith('.pkg') || l.endsWith('.rar')) && !processed.has(f)) return;
      }
    } catch {}
  }

  lanInstallerStarted = true;
  logPs5(TAG, '🎉 TODAS LAS DESCARGAS COMPLETADAS Y ORGANIZADAS EN DISCO.', LOG_FILE);
  if (process.env.PS5_AUTO_INSTALL === 'true') {
    logPs5(TAG, '🚀 Auto-iniciando Fase 2: Instalador LAN...', LOG_FILE);
    spawn(process.execPath, [path.join(__dirname, 'lan_installer.js')], { detached: true, stdio: 'ignore' }).unref();
  } else {
    logPs5(TAG, '⏸️ Instalación en espera (descarga masiva primero / auditoría GLM).', LOG_FILE);
  }
}

function main() {
  if (!acquirePid(PID_FILE)) {
    console.error(`[${TAG}] Ya hay un watcher activo (${PID_FILE}). Saliendo.`);
    process.exit(1);
  }
  process.on('exit', () => releasePid(PID_FILE));
  process.on('SIGINT', () => { logPs5(TAG, 'Cerrando centinela...', LOG_FILE); process.exit(0); });
  logPs5(TAG, `Centinela IDM iniciado. Watch: ${WATCH_DIRS.join(', ')}`, LOG_FILE);
  setInterval(checkNewFiles, 10000);
  checkNewFiles();
}

main();
