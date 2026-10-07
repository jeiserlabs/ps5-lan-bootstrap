#!/usr/bin/env node
/**
 * @file daemon.js
 * @description Daemon del pipeline PS5: extrae archivos .rar/.zip del Desktop, clasifica
 *   PKGs por Title ID y los instala en la consola por LAN (pkg-receiver 12800) en cascada
 *   BASE → UPDATE → DLC. Endurecido: verifica que la extracción produjo un PKG antes de
 *   borrar el comprimido, consulta el estado real de la PS5 antes de enviar y usa pidfile.
 * Uso:
 *   node scripts/ps5/daemon.js          # Loop
 *   node scripts/ps5/daemon.js --once   # Un solo ciclo
 *   node scripts/ps5/daemon.js --status # Resumen y sale
 * SRP < 300L.
 */
const fs = require('node:fs');
const path = require('node:path');
const { getPs5Config } = require('../lib/config.js');
const { extractArchive: extractArchiveHardened } = require('../lib/archive_extractor.js');
const pkgRules = require('../lib/pkg_rules.js');
const { logPs5 } = require('../lib/pipeline_log.js');
const { acquirePid, releasePid } = require('../lib/pidfile.js');
const { installPkg } = require('./lan_installer.js');

const cfg = getPs5Config();
const INSTALLED_FILE = cfg.state.installedFile || path.join(cfg.state.cacheDir, 'installed_pkgs.json');
const PID_FILE = path.join(cfg.state.cacheDir, 'daemon.pid');
const TAG = 'DAEMON';
const ARCHIVE_EXT = new Set(['.rar', '.zip']);
let tgSend = null;
try { tgSend = require('../lib/telegram.js').sendTelegramMessage; } catch {}
function notifyTg(text) { if (tgSend) tgSend(text).catch(() => {}); }

function loadInstalled() {
  // SSOT único: data/cache/ps5/installed_pkgs.json. El legacy de raíz solo se lee
  // una vez para migrar (nunca se escribe).
  if (!fs.existsSync(INSTALLED_FILE)) {
    const legacy = path.resolve(__dirname, '..', '..', 'installed_pkgs_ps5.json');
    if (fs.existsSync(legacy)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(legacy, 'utf8'));
        if (Array.isArray(parsed)) {
          fs.mkdirSync(path.dirname(INSTALLED_FILE), { recursive: true });
          fs.writeFileSync(INSTALLED_FILE, `${JSON.stringify(parsed, null, 2)}\n`);
        }
      } catch {}
    }
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(INSTALLED_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveInstalled(installed) {
  fs.mkdirSync(path.dirname(INSTALLED_FILE), { recursive: true });
  fs.writeFileSync(INSTALLED_FILE, `${JSON.stringify(installed, null, 2)}\n`);
}

/**
 * Delega exclusivamente en el extractor endurecido (multipart fail-fast,
 * espacio, timeout, Zip Slip). Una sola implementacion en produccion.
 * @param {string} archivePath
 * @returns {boolean}
 */
/**
 * @param {string} archivePath
 * @returns {{ success: boolean, retryable?: boolean }}
 */
function extractArchive(archivePath) {
  const destDir = cfg.paths.libraryDirs[0];
  const res = extractArchiveHardened(archivePath, destDir, cfg.state.logFile);
  if (!res.success && res.error) {
    logPs5(TAG, `Extracción rechazada: ${res.error}`, cfg.state.logFile);
  }
  return { success: res.success, retryable: res.retryable };
}

/**
 * @param {string} dir
 * @param {number} depth
 * @param {string[]} out
 */
function walkPkgs(dir, depth, out) {
  if (depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkPkgs(full, depth - 1, out);
    else if (entry.name.toLowerCase().endsWith('.pkg')) out.push(full);
  }
}

function listPkgs() {
  const out = [];
  for (const dir of cfg.paths.libraryDirs) walkPkgs(dir, 3, out);
  return out;
}

function processPendingArchives() {
  if (!fs.existsSync(cfg.paths.watchDir)) return;
  const quarantine = path.join(cfg.paths.stagingDir, '_quarantine');
  for (const file of fs.readdirSync(cfg.paths.watchDir)) {
    if (!ARCHIVE_EXT.has(path.extname(file).toLowerCase())) continue;
    const fullPath = path.join(cfg.paths.watchDir, file);
    // Guarda anti-mod: contenido tocado (Unlock-All) a cuarentena, jamás a la consola.
    if (pkgRules.isModBlocked(file)) {
      try {
        fs.mkdirSync(quarantine, { recursive: true });
        try {
          fs.renameSync(fullPath, path.join(quarantine, file));
        } catch (err) {
          if (err.code !== 'EXDEV') throw err;
          fs.copyFileSync(fullPath, path.join(quarantine, file));
          fs.unlinkSync(fullPath);
        }
        logPs5(TAG, `🚫 MOD bloqueado y en cuarentena: ${file}`, cfg.state.logFile);
        notifyTg(`🚫 <b>MOD bloqueado:</b> <code>${file}</code> va a cuarentena, no a la consola.`);
      } catch (err) {
        logPs5(TAG, `No se pudo cuarentenar ${file}: ${err.message}`, cfg.state.logFile);
      }
      continue;
    }
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (Date.now() - stat.mtimeMs < 10000) continue; // aún escribiéndose
    logPs5(TAG, `Extrayendo: ${file}`, cfg.state.logFile);
    const extRes = extractArchive(fullPath);
    if (!extRes.success) {
      if (extRes.retryable) {
        // Multipart incompleto: NO mandar a .failed; el resto de
        // volúmenes aún está descargando y se reintenta cada ciclo.
        logPs5(TAG, `⏳ Partes incompletas, esperando resto de volúmenes: ${file}`, cfg.state.logFile);
        continue;
      }
      const failed = `${fullPath}.failed`;
      try {
        fs.renameSync(fullPath, failed);
      } catch {
        // si no se puede renombrar, se deja como está
      }
      logPs5(TAG, `Extracción FALLIDA (clave/corrupto): ${file}`, cfg.state.logFile);
      continue;
    }
    // 7z/WinRAR solo salen con código 0 cuando el CRC de TODO el archivo pasó: éxito verificado.
    try {
      fs.unlinkSync(fullPath);
      logPs5(TAG, `Extraído y verificado (comprimido eliminado): ${file}`, cfg.state.logFile);
      notifyTg(`📦 <b>Juego Extraído y Listo:</b>\n• <code>${file}</code>\n• Preparando para enviar a PS5.`);
    } catch {
      logPs5(TAG, `Extraído, pero no se pudo borrar el comprimido: ${file}`, cfg.state.logFile);
    }
  }
}

/**
 * Mueve a biblioteca los .pkg sueltos que caen en el Desktop (descargas directas de AkiraBox).
 * Guarda: ignora archivos con menos de 60s desde la última escritura (aún terminando) y no
 * pisa un archivo ya presente en la biblioteca.
 */
function processLoosePkgs() {
  if (!fs.existsSync(cfg.paths.watchDir)) return;
  const quarantine = path.join(cfg.paths.stagingDir, '_quarantine');
  for (const file of fs.readdirSync(cfg.paths.watchDir)) {
    if (path.extname(file).toLowerCase() !== '.pkg') continue;
    // Guarda anti-mod también para PKGs sueltos.
    if (pkgRules.isModBlocked(file)) {
      try {
        fs.mkdirSync(quarantine, { recursive: true });
        fs.renameSync(path.join(cfg.paths.watchDir, file), path.join(quarantine, file));
        logPs5(TAG, `🚫 MOD bloqueado y en cuarentena: ${file}`, cfg.state.logFile);
        notifyTg(`🚫 <b>MOD bloqueado:</b> <code>${file}</code> va a cuarentena, no a la consola.`);
      } catch (err) {
        logPs5(TAG, `No se pudo cuarentenar ${file}: ${err.message}`, cfg.state.logFile);
      }
      continue;
    }
    const fullPath = path.join(cfg.paths.watchDir, file);
    try {
      const stat = fs.statSync(fullPath);
      if (Date.now() - stat.mtimeMs < 60000) continue;
      const dest = path.join(cfg.paths.libraryDirs[0], file);
      if (fs.existsSync(dest)) continue;
      try {
        fs.renameSync(fullPath, dest);
      } catch (err) {
        if (err.code !== 'EXDEV') throw err;
        // Cross-device (C: -> E:): copiar + borrar en vez de renombrar.
        fs.copyFileSync(fullPath, dest);
        fs.unlinkSync(fullPath);
      }
      logPs5(TAG, `PKG movido a biblioteca: ${file}`, cfg.state.logFile);
    } catch (err) {
      logPs5(TAG, `No se pudo mover ${file}: ${err.message}`, cfg.state.logFile);
    }
  }
}

async function installPass() {
  const installed = loadInstalled();
  const plan = pkgRules.planInstallOrder(listPkgs(), installed);
  if (plan.plan.length === 0) return;

  const pkgToInstall = plan.plan[0];
  await installPkg(pkgToInstall);

  if (plan.held.length > 0) {
    logPs5(TAG, `Retenidos por cascada: ${plan.held.length} PKG(s) (esperan base o son redundantes)`, cfg.state.logFile);
  }
}

async function cycle() {
  processPendingArchives();
  processLoosePkgs();
  await installPass();
}

function printStatus() {
  const installed = loadInstalled();
  const plan = pkgRules.planInstallOrder(listPkgs(), installed);
  console.log(`[PS5 DAEMON] Instalados registrados: ${installed.length}`);
  console.log(`[PS5 DAEMON] Planificados este ciclo: ${plan.plan.length}`);
  for (const pkgPath of plan.plan) console.log(`  + ${path.basename(pkgPath)} [${pkgRules.classifyPkg(path.basename(pkgPath))}]`);
  console.log(`[PS5 DAEMON] Retenidos: ${plan.held.length}`);
  for (const held of plan.held) console.log(`  - ${path.basename(held.file)} — ${held.reason}`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--status')) {
    printStatus();
    return;
  }
  if (!acquirePid(PID_FILE)) {
    console.error(`[PS5 DAEMON] Ya hay una instancia viva (pidfile ${PID_FILE}). Saliendo.`);
    process.exit(1);
  }
  process.on('exit', () => releasePid(PID_FILE));
  console.log('[PS5 DAEMON] Iniciado (ciclo cada 30s). Instalaciones en cascada BASE -> UPDATE -> DLC.');
  if (args.includes('--once')) {
    await cycle();
    process.exit(0);
  }
  await cycle();
  setInterval(() => {
    cycle().catch((err) => logPs5(TAG, `Error en ciclo: ${err.message}`, cfg.state.logFile));
  }, 30000);
}

main().catch((err) => {
  console.error(`[PS5 DAEMON] ERROR FATAL: ${err.message}`);
  process.exit(1);
});
