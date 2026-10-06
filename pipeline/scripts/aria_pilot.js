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
const { extractArchive, cleanupArchiveVolumes, inspectMultiPart } = require('../lib/archive_extractor.js');
const { resolveGameFolder, moveFileToGameFolder, getBestTargetLibrary } = require('../lib/library_organizer.js');
const { resolveDownloadUrl } = require('../lib/akira_resolver.js');
const downloadEngine = require('../lib/download_engine.js');

const cfg = getPs5Config();
const ARIA_EXE = path.join(__dirname, '..', '..', 'tools', 'aria2c', 'aria2c.exe');
const ARIA_CONF = path.join(__dirname, '..', '..', 'tools', 'aria2c', 'aria2.conf');
const PID_FILE = path.join(cfg.state.cacheDir, 'aria_pilot.pid');
const LOG_FILE = path.join(path.dirname(cfg.state.logFile), 'aria_pilot.log');
const QUEUE_FILE = cfg.state.queueFile || path.join(cfg.state.cacheDir, 'queue_state.json');
const STAGING_DIR = cfg.paths.stagingDir || 'E:\\staging';
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

const QUEUE_LOCK = `${QUEUE_FILE}.lock`; // mismo protocolo que queue_io.loadLocked
function acquireQueueLock() {
  try { fs.mkdirSync(QUEUE_LOCK); return true; } catch { return false; }
}
function releaseQueueLock() {
  try { fs.rmdirSync(QUEUE_LOCK); } catch {}
}

function saveQueue(state) {
  state.updatedAt = new Date().toISOString();
  const tmp = `${QUEUE_FILE}.tmp.${Date.now()}`;
  fs.mkdirSync(path.dirname(QUEUE_FILE), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  fs.renameSync(tmp, QUEUE_FILE);
}

function getFilenameFromUrl(url) {
  try {
    const { URL } = require('node:url');
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    let cand = parts.pop();
    if (cand === 'file' && parts.length > 0) cand = parts.pop();
    if (cand) {
      cand = decodeURIComponent(cand).replace(/^[a-zA-Z0-9]{15,35}-(?=\[)/, '');
      if (cand.includes('.')) return cand;
    }
  } catch {}
  return null;
}

/**
 * Procesa un archivo descargado (descompresión y validación \x7fCNT).
 * Retorna 'completed' | 'deferred' | 'failed'
 * @param {string} filePath
 * @returns {string}
 */
function processCompletedFile(filePath) {
  if (!fs.existsSync(filePath)) return 'failed';
  try {
    const sz = fs.statSync(filePath).size;
    if (sz < 1048576) {
      let isPkg = false;
      try {
        const fd = fs.openSync(filePath, 'r');
        const buf = Buffer.alloc(4);
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        if (buf.toString('hex') === '7f434e54') isPkg = true;
      } catch {}
      if (!isPkg) {
        logPs5(TAG, `☠️ Archivo veneno (${sz} bytes), eliminado: ${path.basename(filePath)}`, LOG_FILE);
        try { fs.unlinkSync(filePath); } catch {}
        try { fs.unlinkSync(`${filePath}.aria2`); } catch {}
        return 'poison';
      }
    }
  } catch { return 'failed'; }
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
          if (processCompletedFile(extracted) !== 'completed') allOk = false;
        }
      }
      return allOk ? 'completed' : 'failed';
    }
    if (extractRes.error && (extractRes.error.includes('Volúmenes incompletos') || extractRes.error.includes('no es el volumen part1') || extractRes.error.includes('part1 ausente'))) {
      logPs5(TAG, `⏳ Volumen descargado en disco. Esperando partes restantes para descomprimir.`, LOG_FILE);
      return 'deferred';
    }
    logPs5(TAG, `⚠️ Extracción pendiente o fallida: ${extractRes.error}`, LOG_FILE);
    return 'failed';
  }

  if (ext === '.pkg') {
    logPs5(TAG, `🔍 Auditoría forense \\x7fCNT: ${path.basename(filePath)}`, LOG_FILE);
    const val = validatePkg(filePath);
    if (!val.valid) {
      logPs5(TAG, `❌ PKG INVÁLIDO (${val.reason}): ${filePath}`, LOG_FILE);
      return 'failed';
    }
    const targetDir = getBestTargetLibrary(filePath, LOG_FILE);
    const moveRes = moveFileToGameFolder(filePath, targetDir, LOG_FILE);
    if (!moveRes.success) {
      logPs5(TAG, `❌ No se pudo organizar: ${moveRes.error || filePath}`, LOG_FILE);
      return 'failed';
    }
    const finalPath = moveRes.destPath || filePath;
    logPs5(TAG, `🎉 JUEGO ORGANIZADO Y LISTO: ${path.basename(finalPath)} ➔ ${targetDir}`, LOG_FILE);
    return 'completed';
  }
  return 'failed';
}

async function cycle() {
  if (!(await ensureAriaRunning())) return;
  // Lock compartido con queue_io: si otra herramienta edita la cola, este
  // ciclo se salta (no pisa ediciones externas). loadLocked espera/reintenta.
  if (!acquireQueueLock()) {
    logPs5(TAG, 'Cola bloqueada por otra herramienta, ciclo saltado.', LOG_FILE);
    return;
  }
  try {
    await cycleLocked();
  } finally {
    releaseQueueLock();
  }
}

/**
 * Ciclo central del piloto autónomo (con lock de cola adquirido).
 */
async function cycleLocked() {
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
    if (!(statusRes.ok && statusRes.status)) {
      // aria2c se reinició o purgó el GID: no quedarse atascado, reencolar.
      const stuck = queue.items.find((i) => i.gid === activeGid);
      if (stuck) {
        stuck.attempts = (stuck.attempts || 0) + 1;
        stuck.status = stuck.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
        stuck.error = `GID ${activeGid} desconocido en aria2c (reinicio?). Reencolado.`;
        delete stuck.gid;
        saveQueue(queue);
        logPs5(TAG, `🔄 ${stuck.name}: ${stuck.error}`, LOG_FILE);
      }
      activeGid = null;
      return;
    }
    {
      const s = statusRes.status;
      const item = queue.items.find((i) => i.status === 'downloading' || i.gid === activeGid);

      if (s.status === 'complete') {
        const filePath = s.files?.[0]?.path;
        logPs5(TAG, `🎉 aria2 completó descarga GID ${activeGid}: ${filePath}`, LOG_FILE);
        await downloadEngine.purgeDownloadResult();

        if (item) {
          item.status = 'processing';
          saveQueue(queue);
          const result = filePath ? processCompletedFile(filePath) : 'failed';
          if (result === 'completed') {
            item.status = 'completed';
            item.completedAt = new Date().toISOString();
            logPs5(TAG, `✅ Ítem completado e instalado en biblioteca: ${item.name}`, LOG_FILE);
            try {
              const { sendTelegramMessage } = require('../lib/telegram.js');
              sendTelegramMessage(`✅ *Descarga lista:* ${item.name}`).catch(() => {});
            } catch {}

            const multi = inspectMultiPart(path.basename(filePath));
            if (multi.isMultiPart && multi.basePattern) {
              for (const other of queue.items) {
                if (other.status === 'downloaded' && other.url.toLowerCase().includes(multi.basePattern.toLowerCase())) {
                  other.status = 'completed';
                  other.completedAt = new Date().toISOString();
                  logPs5(TAG, `✅ Marcada parte hermana completada: ${other.name}`, LOG_FILE);
                }
              }
            }
          } else if (result === 'deferred') {
            item.status = 'downloaded';
            item.note = 'Volumen en disco; esperando partes restantes';
            logPs5(TAG, `📦 Volumen preservado en disco: ${item.name}`, LOG_FILE);
          } else if (result === 'poison') {
            item.status = 'failed';
            item.error = 'Enlace expirado (servidor devolvió página de error en vez del archivo). Re-mintar en Brave.';
            delete item.gid;
            logPs5(TAG, `☠️ ${item.name}: enlace expirado, esperando URL fresca`, LOG_FILE);
            try {
              const { sendTelegramMessage } = require('../lib/telegram.js');
              sendTelegramMessage(`🔗 *Link expirado:* ${item.name}\nRe-míntalo en Brave y pégalo aquí para reanudar.`).catch(() => {});
            } catch {}
          } else {
            item.status = 'failed';
            item.error = 'Error en validación o extracción de archivo';
            logPs5(TAG, `❌ Ítem fallido: ${item.name} (${item.error})`, LOG_FILE);
            try {
              const { sendTelegramMessage } = require('../lib/telegram.js');
              sendTelegramMessage(`❌ *Falló:* ${item.name}`).catch(() => {});
            } catch {}
          }
          saveQueue(queue);
        }
      } else if (s.status === 'error') {
        logPs5(TAG, `🚨 Error en descarga GID ${activeGid} (${s.errorCode}): ${s.errorMessage}`, LOG_FILE);
        if (item) {
          item.attempts = (item.attempts || 0) + 1;
          item.status = item.attempts >= MAX_ATTEMPTS ? 'failed' : 'pending';
          item.error = s.errorMessage;
          const expM = String(item.url || '').match(/[?&](access|expiration)=(\d+)/);
          if (expM) {
            let ts = Number(expM[2]);
            if (expM[1] === 'expiration' || ts < 1e12) ts *= 1000;
            if (Date.now() > ts) {
              item.status = 'failed';
              item.error = `Enlace firmado expirado (${new Date(ts).toISOString()}). Regenerar desde dlpsgame. ${s.errorMessage || ''}`.trim();
              logPs5(TAG, `❌ ${item.name}: ${item.error}`, LOG_FILE);
            }
          }
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

  // Guardia: sin URL http real (marcas como 're-mint'/'akirabox-minted')
  // no se intenta resolver: esperan link fresco humano, no queman intentos.
  if (!/^https?:\/\//i.test(nextItem.url || '')) {
    return;
  }

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
  const options = { dir: STAGING_DIR };
  const targetFilename = getFilenameFromUrl(nextItem.url);
  if (targetFilename) options.out = targetFilename;
  const addRes = await downloadEngine.addUri([resolved.directUrl], options);
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
  const SPRINT_LOCK = path.join(cfg.state.cacheDir, 'sprint.lock');
  if (fs.existsSync(SPRINT_LOCK)) {
    // Lock stale (sprint muerto sin limpiar) => liberarlo, no bloquear para siempre.
    let stale = true;
    try {
      const lock = JSON.parse(fs.readFileSync(SPRINT_LOCK, 'utf8'));
      if (lock && lock.pid) {
        try { process.kill(lock.pid, 0); stale = false; } catch { stale = true; }
      }
    } catch { stale = true; }
    if (stale) {
      try { fs.unlinkSync(SPRINT_LOCK); } catch {}
      logPs5(TAG, 'sprint.lock stale liberado (sprint muerto). Pilot continúa.', LOG_FILE);
    } else {
      logPs5(TAG, 'Sprint manual activo (sprint.lock). Pilot en espera, saliendo sin interferir.', LOG_FILE);
      process.exit(0);
    }
  }
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
