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
const { sendTelegramMessage } = require('../lib/telegram.js');

const cfg = getPs5Config();
const WATCH_DIRS = [
  cfg.paths.watchDir, // C:\Users\dev\Desktop
  'C:\\Users\\dev\\Downloads\\Compressed',
  'C:\\Users\\dev\\Downloads',
].filter((d) => fs.existsSync(d));
const TARGET_DIR = cfg.paths.libraryDirs[0]; // C:\Biblioteca_Juegos_PS
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
  } catch (err) {
    if (err && (err.code === 'EBUSY' || err.code === 'EPERM')) return true;
    return false;
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

    // Organizar en carpeta del juego
    const gameFolder = resolveGameFolder(TARGET_DIR, result.info.title, result.info.titleId);
    const moveRes = moveFileToGameFolder(fullPath, gameFolder, LOG_FILE);

    if (moveRes.success) {
      processed.add(filename);
      lastSizes.delete(filename);
      sendTelegramMessage(`📦 <b>Juego Verificado y Listo:</b>\n• <code>[${result.info.titleId}] ${result.info.title}</code> (${sizeGb} GB)\n• Guardado en biblioteca.`);
    }
  } else {
    logPs5(TAG, `❌ RECHAZADO: ${filename} NO pasó la validación forense:`, LOG_FILE);
    for (const err of result.errors) {
      logPs5(TAG, `   └─ ${err}`, LOG_FILE);
    }
    const corruptPath = `${fullPath}.corrupt`;
    try {
      fs.renameSync(fullPath, corruptPath);
      logPs5(TAG, `⚠️ Puesto en cuarentena: ${corruptPath}`, LOG_FILE);
      processed.add(filename);
      lastSizes.delete(filename);
    } catch (renErr) {
      logPs5(TAG, `No se pudo renombrar corrupto: ${renErr.message}`, LOG_FILE);
    }
  }
}

/**
 * Procesa un archivo .rar completo en Desktop.
 * @param {string} fullPath
 * @param {string} filename
 */
const lastRarAttempt = new Map();

function handleRarArchive(fullPath, filename) {
  const multi = inspectMultiPart(filename);
  if (multi.isMultiPart && multi.partNum !== 1) {
    // Es parte 2, 3... esperar a que part1 coordine la extracción
    return;
  }

  const lastAttempt = lastRarAttempt.get(filename) || 0;
  if (Date.now() - lastAttempt < 60000) {
    return; // Esperar al menos 60s antes de reintentar si faltan volúmenes
  }
  lastRarAttempt.set(filename, Date.now());

  logPs5(TAG, `📦 Iniciando descompresión automática de ${filename}...`, LOG_FILE);
  const extRes = extractArchive(fullPath, STAGING_DIR, LOG_FILE);

  if (!extRes.success) {
    logPs5(TAG, `⚠️ Descompresión pendiente o incompleta: ${extRes.error}`, LOG_FILE);
    return;
  }

  // Buscar todos los PKG extraídos en staging (recursivo para RARs con subcarpetas)
  function collectStagedPkgs(dir) {
    const list = [];
    try {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          list.push(...collectStagedPkgs(full));
        } else if (ent.name.toLowerCase().endsWith('.pkg')) {
          list.push(full);
        }
      }
    } catch {}
    return list;
  }

  const stagedPkgs = collectStagedPkgs(STAGING_DIR);
  for (const pkgPath of stagedPkgs) {
    handlePkgFile(pkgPath, path.basename(pkgPath));
  }

  if (stagedPkgs.length > 0) {
    // Limpieza del archivo RAR para liberar espacio en disco
    cleanupArchiveVolumes(fullPath, LOG_FILE);
    processed.add(filename);
    lastSizes.delete(filename);
    try {
      fs.rmSync(STAGING_DIR, { recursive: true, force: true });
    } catch {}
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

      if (locked || stat.size !== prevSize || (expectedSize > 0 && stat.size < expectedSize) || timeSinceMod < 15000) {
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

  checkAutoTransition();
}

let lanInstallerStarted = false;

function checkAutoTransition() {
  if (lanInstallerStarted) return;

  // 1. Verificar si la cola de IDM está completamente terminada
  try {
    const qOut = execSync('reg query HKCU\\Software\\DownloadManager\\Queue /v Queue', { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8', timeout: 2000 });
    const qM = qOut.match(/Queue\s+REG_SZ\s+(.*)$/m);
    const queueIds = qM ? qM[1].trim().split(/\s+/).filter(Boolean) : [];
    if (queueIds.length === 0) return; // Cola vacía o no inicializada

    for (const id of queueIds) {
      try {
        const out = execSync(`reg query HKCU\\Software\\DownloadManager\\${id} /v Status`, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8', timeout: 1500 });
        const stM = out.match(/Status\s+REG_DWORD\s+0x([0-9a-fA-F]+)/m);
        if (st !== 3 && st !== 5) return; // Hay al menos una descarga pendiente (no terminada)
      } catch {
        return;
      }
    }
  } catch {
    return;
  }

  // 2. Verificar que no queden archivos pendientes o extracciones en los directorios de vigilancia
  for (const dir of WATCH_DIRS) {
    try {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        const l = f.toLowerCase();
        if ((l.endsWith('.pkg') || l.endsWith('.rar')) && !processed.has(f)) {
          return;
        }
      }
    } catch {}
  }

  // 3. Todo descargado y verificado en PC: auto-arrancar Fase 2 LAN
  lanInstallerStarted = true;
  logPs5(TAG, '🎉 TODAS LAS DESCARGAS COMPLETADAS Y ORGANIZADAS EN DISCO.', LOG_FILE);
  logPs5(TAG, '🚀 Auto-iniciando Fase 2: Instalador LAN en cascada 1x1...', LOG_FILE);
  sendTelegramMessage(`🎉 <b>Todas las Descargas Completadas:</b>\n• Todos los juegos están verificados en disco.\n• Iniciando instalación automática a PS5 por LAN...`);

  const lanScript = path.join(__dirname, 'lan_installer.js');
  const child = spawn(process.execPath, [lanScript], { detached: true, stdio: 'ignore' });
  child.unref();
}

function main() {
  if (!acquirePid(PID_FILE)) {
    console.error(`[${TAG}] Ya hay un watcher activo (pidfile ${PID_FILE}). Saliendo.`);
    process.exit(1);
  }

  process.on('exit', () => releasePid(PID_FILE));
  process.on('SIGINT', () => {
    logPs5(TAG, 'Cerrando centinela...', LOG_FILE);
    process.exit(0);
  });

  logPs5(TAG, `Centinela IDM blindado iniciado. Watch: ${WATCH_DIRS.join(', ')}, Lib: ${TARGET_DIR}`, LOG_FILE);

  setInterval(checkNewFiles, 10000);
  checkNewFiles();
}

main();
