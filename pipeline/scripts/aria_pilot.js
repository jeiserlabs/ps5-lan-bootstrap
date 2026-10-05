#!/usr/bin/env node
/**
 * @file aria_pilot.js
 * @description Daemon piloto 100% autónomo para descargas vía aria2c (JSON-RPC :6800).
 *   Administra cola 1x1, resolución de enlaces, crash-recovery, descompresión 7z y validación \x7fCNT.
 * Uso:
 *   node pipeline/scripts/aria_pilot.js         # Modo daemon continuo (cada 5s)
 *   node pipeline/scripts/aria_pilot.js --once  # Un solo ciclo y sale
 * SRP < 280L. Cero dependencias npm externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { getPs5Config } = require('../lib/config.js');
const { logPs5 } = require('../lib/pipeline_log.js');
const { acquirePid, releasePid } = require('../lib/pidfile.js');
const { validatePkg } = require('../lib/pkg_validator.js');
const { extractArchive, cleanupArchiveVolumes } = require('../lib/archive_extractor.js');
const { resolveGameFolder, moveFileToGameFolder, getBestTargetLibrary } = require('../lib/library_organizer.js');
const { resolveDownloadUrl } = require('../lib/akira_resolver.js');
const downloadEngine = require('../lib/download_engine.js');

const cfg = getPs5Config();
const ARIA_EXE = path.join(__dirname, '..', '..', 'tools', 'aria2c', 'aria2c.exe');
const ARIA_CONF = path.join(__dirname, '..', '..', 'tools', 'aria2c', 'aria2.conf');
const PID_FILE = path.join(cfg.state.cacheDir, 'aria_pilot.pid');
const LOG_FILE = path.join(path.dirname(cfg.state.logFile), 'aria_pilot.log');
const QUEUE_FILE = cfg.state.queueFile || path.join(cfg.state.cacheDir, 'queue_state.json');
const STAGING_DIR = 'E:\\';
const MAX_ATTEMPTS = 3;
const TAG = 'ARIA_PILOT';

let activeGid = null;
let lastProgressLog = 0;

/**
 * Asegura que aria2c.exe esté ejecutándose con RPC habilitado.
 */
async function ensureAriaRunning() {
  if (await downloadEngine.isRpcAlive()) return true;
  if (!fs.existsSync(ARIA_EXE)) {
    logPs5(TAG, `❌ Binario no encontrado: ${ARIA_EXE}`, LOG_FILE);
    return false;
  }
  logPs5(TAG, '⚡ Iniciando servicio headless aria2c.exe (:6800)...', LOG_FILE);
  const child = spawn(ARIA_EXE, [`--conf-path=${ARIA_CONF}`], { detached: true, stdio: 'ignore' });
  child.unref();

  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (await downloadEngine.isRpcAlive()) {
      logPs5(TAG, '✅ aria2c RPC online y respondiendo.', LOG_FILE);
      return true;
    }
  }
  return false;
}

function loadQueue() {
  if (!fs.existsSync(QUEUE_FILE)) return { version: 1, items: [] };
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8')); } catch { return { version: 1, items: [] }; }
}

function saveQueue(state) {
  state.updatedAt = new Date().toISOString();
  const tmp = `${QUEUE_FILE}.tmp.${Date.now()}`;
  fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, QUEUE_FILE);
}

/**
 * Procesa un archivo descargado (descompresión y validación \x7fCNT).
 * Retorna true solo si el archivo es válido y fue organizado con éxito.
 * @param {string} filePath
 * @returns {boolean}
 */
function processCompletedFile(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.rar' || ext === '.zip') {
    logPs5(TAG, `📦 Iniciando descompresión 1x1: ${path.basename(filePath)}...`, LOG_FILE);
    const extractRes = extractArchive(filePath, STAGING_DIR, LOG_FILE);
    if (extractRes.success) {
      logPs5(TAG, `✅ Extracción completada. Limpiando volúmenes comprimidos...`, LOG_FILE);
      cleanupArchiveVolumes(filePath, LOG_FILE);
      let allOk = true;
      for (const extracted of extractRes.extractedFiles) {
        if (extracted.toLowerCase().endsWith('.pkg')) {
          if (!processCompletedFile(extracted)) allOk = false;
        }
      }
      return allOk;
    }
    logPs5(TAG, `⚠️ Extracción pendiente o fallida: ${extractRes.error}`, LOG_FILE);
    return false;
  }

  if (ext === '.pkg') {
    logPs5(TAG, `🔍 Auditoría forense \\x7fCNT: ${path.basename(filePath)}`, LOG_FILE);
    const val = validatePkg(filePath);
    if (!val.valid) {
      logPs5(TAG, `❌ PKG INVÁLIDO (${val.reason}): ${filePath}`, LOG_FILE);
      return false;
    }
    const targetDir = getBestTargetLibrary(filePath, LOG_FILE);
    const finalPath = moveFileToGameFolder(filePath, targetDir, LOG_FILE);
    logPs5(TAG, `🎉 JUEGO ORGANIZADO Y LISTO: ${path.basename(finalPath || filePath)} ➔ ${targetDir}`, LOG_FILE);
    return true;
  }
  return false;
}

/**
 * Ciclo central del piloto autónomo.
 */
async function cycle() {
  if (!(await ensureAriaRunning())) return;

  const queue = loadQueue();

  // 1. Crash Recovery: recuperar descarga activa si el daemon fue reiniciado
  if (!activeGid) {
    const orphanItem = queue.items.find((i) => i.status === 'downloading' && i.gid);
    if (orphanItem) {
      activeGid = orphanItem.gid;
      logPs5(TAG, `🔄 Recuperando descarga tras reinicio: ${orphanItem.name} (GID: ${activeGid})`, LOG_FILE);
    }
  }

  const activeDownloads = await downloadEngine.tellActive();

  // 2. Monitoreo de descarga en curso
  if (activeDownloads.length > 0) {
    const current = activeDownloads[0];
    activeGid = current.gid;
    const completed = Number(current.completedLength || 0);
    const total = Number(current.totalLength || 1);
    const speed = (Number(current.downloadSpeed || 0) / (1024 * 1024)).toFixed(1);
    const pct = total > 0 ? ((completed / total) * 100).toFixed(1) : '0';
    const filename = current.files?.[0]?.path ? path.basename(current.files[0].path) : activeGid;

    const now = Date.now();
    if (now - lastProgressLog > 10000) {
      lastProgressLog = now;
      logPs5(TAG, `⬇️ [${pct}%] ${filename} @ ${speed} MB/s (${(completed / (1024 ** 3)).toFixed(2)} / ${(total / (1024 ** 3)).toFixed(2)} GB)`, LOG_FILE);
    }
    return;
  }

  // 3. Si terminó o falló la descarga activa previa
  if (activeGid) {
    const statusRes = await downloadEngine.tellStatus(activeGid);
    if (statusRes.ok && statusRes.status) {
      const s = statusRes.status;
      const item = queue.items.find((i) => i.status === 'downloading' || i.gid === activeGid);

      if (s.status === 'complete') {
        const filePath = s.files?.[0]?.path;
        logPs5(TAG, `🎉 aria2 completó descarga GID ${activeGid}: ${filePath}`, LOG_FILE);
        await downloadEngine.purgeDownloadResult();

        if (item) {
          item.status = 'processing';
          saveQueue(queue);
          const ok = filePath ? processCompletedFile(filePath) : false;
          if (ok) {
            item.status = 'completed';
            item.completedAt = new Date().toISOString();
            logPs5(TAG, `✅ Ítem completado e instalado en biblioteca: ${item.name}`, LOG_FILE);
          } else {
            item.status = 'failed';
            item.error = 'Error en validación o extracción de archivo';
          }
          saveQueue(queue);
        }
      } else if (s.status === 'error') {
        logPs5(TAG, `🚨 Error en descarga GID ${activeGid} (${s.errorCode}): ${s.errorMessage}`, LOG_FILE);
        if (item) {
          item.attempts = (item.attempts || 0) + 1;
          item.status = item.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
          item.error = s.errorMessage;
          delete item.gid;
          saveQueue(queue);
        }
      }
    }
    activeGid = null;
    return;
  }

  // 4. Buscar siguiente ítem pendiente
  const nextItem = queue.items.find((i) => i.status === 'pending');
  if (!nextItem) return;

  // Resolver URL directa si es página web
  logPs5(TAG, `🔍 Verificando URL para: ${nextItem.name}...`, LOG_FILE);
  const resolved = await resolveDownloadUrl(nextItem.url, LOG_FILE);
  if (!resolved.ok || !resolved.directUrl) {
    nextItem.attempts = (nextItem.attempts || 0) + 1;
    if (nextItem.attempts >= MAX_ATTEMPTS) {
      nextItem.status = 'failed';
      nextItem.error = resolved.error || 'Fallo resolviendo enlace de descarga';
      logPs5(TAG, `❌ Ítem fallido tras superar ${MAX_ATTEMPTS} intentos: ${nextItem.name}`, LOG_FILE);
    }
    saveQueue(queue);
    return;
  }

  logPs5(TAG, `🚀 Encolando descarga en aria2: ${nextItem.name}`, LOG_FILE);
  const addRes = await downloadEngine.addUri([resolved.directUrl], { dir: STAGING_DIR });
  if (addRes.ok && addRes.gid) {
    nextItem.status = 'downloading';
    nextItem.gid = addRes.gid;
    activeGid = addRes.gid;
    saveQueue(queue);
    logPs5(TAG, `✅ Descarga iniciada con GID: ${addRes.gid}`, LOG_FILE);
  } else {
    nextItem.attempts = (nextItem.attempts || 0) + 1;
    if (nextItem.attempts >= MAX_ATTEMPTS) nextItem.status = 'failed';
    saveQueue(queue);
  }
}

async function main() {
  if (!acquirePid(PID_FILE)) {
    logPs5(TAG, 'Otro proceso aria_pilot ya está activo. Saliendo.', LOG_FILE);
    process.exit(0);
  }

  process.on('SIGINT', () => { releasePid(PID_FILE); process.exit(0); });
  process.on('SIGTERM', () => { releasePid(PID_FILE); process.exit(0); });
  process.on('exit', () => releasePid(PID_FILE));

  const isOnce = process.argv.includes('--once');
  logPs5(TAG, `Motor aria_pilot activado (modo: ${isOnce ? 'once' : 'daemon continuo 5s'}).`, LOG_FILE);

  if (isOnce) {
    await cycle();
    releasePid(PID_FILE);
    process.exit(0);
  }

  setInterval(async () => {
    try { await cycle(); } catch (e) { logPs5(TAG, `Error en ciclo: ${e.message}`, LOG_FILE); }
  }, 5000);
  await cycle();
}

if (require.main === module) {
  main().catch((err) => {
    logPs5(TAG, `Error fatal: ${err.message}`, LOG_FILE);
    releasePid(PID_FILE);
    process.exit(1);
  });
}

module.exports = { cycle, ensureAriaRunning, processCompletedFile };
