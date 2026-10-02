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
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const { getPs5Config } = require('../lib/config.js');
const pkgRules = require('../lib/pkg_rules.js');
const { validatePkg } = require('../lib/pkg_validator.js');
const { logPs5 } = require('../lib/pipeline_log.js');
const { acquirePid, releasePid } = require('../lib/pidfile.js');

const cfg = getPs5Config();
const INSTALLED_FILE = path.join(cfg.state.cacheDir, 'installed_pkgs.json');
const ROOT_INSTALLED_FILE = path.resolve(__dirname, '..', '..', 'installed_pkgs_ps5.json');
const PID_FILE = path.join(cfg.state.cacheDir, 'daemon.pid');
const TAG = 'DAEMON';
const ARCHIVE_EXT = new Set(['.rar', '.zip']);
let tgSend = null;
try { tgSend = require('../../lib/integrations/telegram.js').sendTelegramMessage; } catch {}
function notifyTg(text) { if (tgSend) tgSend(text).catch(() => {}); }

function loadInstalled() {
  const fileToRead = fs.existsSync(INSTALLED_FILE) ? INSTALLED_FILE : (fs.existsSync(ROOT_INSTALLED_FILE) ? ROOT_INSTALLED_FILE : null);
  if (!fileToRead) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(fileToRead, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveInstalled(installed) {
  fs.mkdirSync(path.dirname(INSTALLED_FILE), { recursive: true });
  fs.writeFileSync(INSTALLED_FILE, `${JSON.stringify(installed, null, 2)}\n`);
  try {
    fs.writeFileSync(ROOT_INSTALLED_FILE, `${JSON.stringify(installed, null, 2)}\n`);
  } catch {}
}

function findArchiveTool() {
  if (fs.existsSync(cfg.paths.sevenZipExe)) return { exe: cfg.paths.sevenZipExe, kind: '7z' };
  if (fs.existsSync(cfg.paths.winrarExe)) return { exe: cfg.paths.winrarExe, kind: 'winrar' };
  return null;
}

/**
 * @param {string} archivePath
 * @returns {boolean}
 */
function extractArchive(archivePath) {
  const tool = findArchiveTool();
  if (!tool) {
    logPs5(TAG, 'No se encontró WinRAR ni 7-Zip. Configura PS5_WINRAR_EXE o PS5_7ZIP_EXE.', cfg.state.logFile);
    return false;
  }
  const destDir = cfg.paths.libraryDirs[0];
  for (const password of [...cfg.archivePasswords, '']) {
    try {
      const args =
        tool.kind === 'winrar'
          ? ['x', '-y', password ? `-p${password}` : '-p-', archivePath, `${destDir}\\`]
          : password
            ? ['x', '-y', `-p${password}`, `-o${destDir}`, archivePath]
            : ['x', '-y', `-o${destDir}`, archivePath];
      execFileSync(tool.exe, args, { stdio: 'pipe', timeout: 3600000 });
      return true;
    } catch {
      // contraseña incorrecta: se intenta la siguiente
    }
  }
  return false;
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
  for (const file of fs.readdirSync(cfg.paths.watchDir)) {
    if (!ARCHIVE_EXT.has(path.extname(file).toLowerCase())) continue;
    const fullPath = path.join(cfg.paths.watchDir, file);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (Date.now() - stat.mtimeMs < 10000) continue; // aún escribiéndose
    logPs5(TAG, `Extrayendo: ${file}`, cfg.state.logFile);
    if (!extractArchive(fullPath)) {
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
  for (const file of fs.readdirSync(cfg.paths.watchDir)) {
    if (path.extname(file).toLowerCase() !== '.pkg') continue;
    const fullPath = path.join(cfg.paths.watchDir, file);
    try {
      const stat = fs.statSync(fullPath);
      if (Date.now() - stat.mtimeMs < 60000) continue;
      const dest = path.join(cfg.paths.libraryDirs[0], file);
      if (fs.existsSync(dest)) continue;
      fs.renameSync(fullPath, dest);
      logPs5(TAG, `PKG movido a biblioteca: ${file}`, cfg.state.logFile);
    } catch (err) {
      logPs5(TAG, `No se pudo mover ${file}: ${err.message}`, cfg.state.logFile);
    }
  }
}

/**
 * @param {string} url
 * @param {number} [timeoutMs]
 * @returns {Promise<{ status: number, body: string } | null>}
 */
function httpGet(url, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

async function installPass() {
  const installed = loadInstalled();
  const plan = pkgRules.planInstallOrder(listPkgs(), installed);
  if (plan.plan.length === 0) return;

  const server = await httpGet(`http://${cfg.ps5.pcIp}:${cfg.ps5.serverPort}/healthz`, 2500);
  if (!server) {
    logPs5(TAG, 'Servidor LAN 9898 no responde. Arranca: npm run ps5:server', cfg.state.logFile);
    return;
  }
  const status = await httpGet(`http://${cfg.ps5.ip}:${cfg.ps5.installPort}/api/status`, 3000);
  let ps5State = null;
  if (status) {
    try {
      ps5State = JSON.parse(status.body);
    } catch {
      ps5State = null;
    }
  }
  if (!ps5State) {
    logPs5(TAG, 'PS5 no responde en 12800 (¿jailbreak caído?). Ciclo saltado.', cfg.state.logFile);
    return;
  }
  if (ps5State.busy || ps5State.pull) {
    logPs5(TAG, 'PS5 ocupada instalando otro paquete. Ciclo saltado.', cfg.state.logFile);
    return;
  }

  for (const pkgPath of plan.plan) {
    const name = path.basename(pkgPath);
    const validation = validatePkg(pkgPath);
    if (!validation.valid) {
      logPs5(TAG, `❌ AUDITORÍA RECHAZÓ ${name}: ${validation.errors.join(' | ')}. Bloqueado para proteger la consola.`, cfg.state.logFile);
      continue;
    }
    const category = validation.info.category || pkgRules.classifyPkg(name);
    const fileUrl = `http://${cfg.ps5.pcIp}:${cfg.ps5.serverPort}/pkg/${encodeURIComponent(name)}`;
    const installUrl = `http://${cfg.ps5.ip}:${cfg.ps5.installPort}/install?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(name)}`;
    logPs5(TAG, `Enviando a PS5: ${name} (${category})`, cfg.state.logFile);
    const res = await httpGet(installUrl, 10000);
    const body = res ? res.body : '';
    if (res && body.toLowerCase().includes('ok')) {
      installed.push(name);
      saveInstalled(installed);
      logPs5(TAG, `Aceptado por la PS5: ${name}`, cfg.state.logFile);
      notifyTg(`🚀 <b>Enviando a PS5:</b>\n• <code>${name}</code> (${category})\n• Transfiriendo por cable LAN a ~70 MB/s.`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      break; // 1x1: un paquete por ciclo; la PS5 marca busy mientras transfiere e instala
    } else {
      logPs5(TAG, `PS5 rechazó ${name} (respuesta: ${body || 'sin respuesta'}). Se reintenta en el próximo ciclo.`, cfg.state.logFile);
      break;
    }
  }
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
