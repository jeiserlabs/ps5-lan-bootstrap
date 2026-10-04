#!/usr/bin/env node
/**
 * @file lan_installer.js - Instalación LAN a PS5 (BASE ➔ UPDATE ➔ DLCs).
 * SRP < 300L. Cero dependencias externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { getPs5Config } = require('../lib/config.js');
const { logPs5 } = require('../lib/pipeline_log.js');
const { validatePkg } = require('../lib/pkg_validator.js');
const pkgRules = require('../lib/pkg_rules.js');

const cfg = getPs5Config();
const LIB_DIRS = cfg.paths.libraryDirs;
const INSTALLED_FILE = path.resolve(__dirname, '..', '..', 'installed_pkgs_ps5.json');
const LOG_FILE = path.join(path.dirname(cfg.state.logFile), 'lan_installer.log');
const TAG = 'LAN_INSTALLER';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}
function loadInstalledList() { try { return JSON.parse(fs.readFileSync(INSTALLED_FILE, 'utf8')); } catch { return []; } }
function saveInstalledList(list) { try { fs.writeFileSync(INSTALLED_FILE, JSON.stringify(list, null, 2) + '\n'); } catch {} }

async function ensureServerRunning() {
  const health = await httpGet(`http://${cfg.ps5.pcIp}:${cfg.ps5.serverPort}/healthz`, 2000);
  if (health && health.status === 200) return true;
  logPs5(TAG, 'Iniciando servidor LAN en puerto 9898...', LOG_FILE);
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { detached: true, stdio: 'ignore' });
  child.unref();
  for (let i = 0; i < 15; i++) {
    await sleep(500);
    const check = await httpGet(`http://${cfg.ps5.pcIp}:${cfg.ps5.serverPort}/healthz`, 1000);
    if (check && check.status === 200) return true;
  }
  return false;
}

function collectLibraryPkgs(dir, depth = 2) {
  const pkgs = [];
  if (depth < 0 || !fs.existsSync(dir)) return pkgs;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name !== '_staging' && ent.name !== '_extracted') {
        pkgs.push(...collectLibraryPkgs(full, depth - 1));
      }
    } else if (ent.name.toLowerCase().endsWith('.pkg')) {
      pkgs.push(full);
    }
  }
  return pkgs;
}

function tcpOpen(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const s = require('node:net').connect({ host, port });
    s.setTimeout(timeoutMs);
    s.on('connect', () => { s.destroy(); resolve(true); });
    s.on('timeout', () => { s.destroy(); resolve(false); });
    s.on('error', () => { s.destroy(); resolve(false); });
  });
}

async function ensureFtpAlive() {
  const alive = await tcpOpen(cfg.ps5.ip, 2121, 2000);
  if (!alive) {
    logPs5(TAG, '⚠️ ftpsrv (2121) caído en PS5. Reactivando vía Payload Manager...', LOG_FILE);
    await httpGet(`http://${cfg.ps5.ip}:8084/loadpayload:ftpsrv-ps5.elf`, 5000);
    await sleep(2500);
  }
}

function verifyFtpInstalled(titleId, category) {
  try {
    const pyScript = path.join(__dirname, 'verify_installed_ftp.py');
    const { execFileSync } = require('node:child_process');
    const out = execFileSync('python', [pyScript, titleId, category], { encoding: 'utf8', timeout: 8000 });
    return out.trim() === 'OK';
  } catch {
    return false;
  }
}

async function waitForPkgTransfer(filename, expectedSize, titleId, category) {
  let lastRangeTime = Date.now();
  let lastEndByte = 0;
  let hasStarted = false;
  let lastReportedPct = -1;

  for (let i = 0; i < 1080; i++) {
    await sleep(5000);
    try {
      if (fs.existsSync(cfg.state.logFile)) {
        const content = fs.readFileSync(cfg.state.logFile, 'utf8');
        const lines = content.trim().split('\n').filter((l) => l.includes(filename) && l.includes('[SERVER] RANGE'));
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
                logPs5(TAG, `⏳ Progreso ${filename}: ${pct}% (${(lastEndByte / 1e9).toFixed(1)} / ${(expectedSize / 1e9).toFixed(1)} GB)`, LOG_FILE);
              }
            }
            if (expectedSize > 0 && endByte >= expectedSize - 0x400000) {
              logPs5(TAG, `📦 100% transferido (${(expectedSize / 1e9).toFixed(2)} GB). Consolidando en PS5...`, LOG_FILE);
              break;
            }
          }
        }
      }
    } catch {}

    if (hasStarted && Date.now() - lastRangeTime > 180000) {
      if (expectedSize > 0 && lastEndByte >= expectedSize * 0.98) {
        logPs5(TAG, `Transferencia HTTP cesó con ${(lastEndByte / 1e9).toFixed(2)} GB (>=98%). Verificando...`, LOG_FILE);
        break;
      }
      logPs5(TAG, `❌ Transferencia estancada a los ${(lastEndByte / 1e9).toFixed(2)} GB. Abortando.`, LOG_FILE);
      return false;
    }
  }

  logPs5(TAG, 'Esperando consolidación interna en PS5...', LOG_FILE);
  for (let j = 0; j < 60; j++) {
    const res = await httpGet(`http://${cfg.ps5.ip}:${cfg.ps5.installPort}/api/status`, 3000);
    if (res && res.status === 200) {
      try {
        const state = JSON.parse(res.body);
        if (!state.busy && !state.pull) break;
      } catch {}
    }
    await sleep(5000);
  }

  await ensureFtpAlive();
  for (let v = 0; v < 24; v++) {
    const isOk = verifyFtpInstalled(titleId, category);
    if (isOk) {
      logPs5(TAG, `🎯 VERIFICACIÓN FTP EXITOSA: [${titleId}] confirmado en PS5 (${category})`, LOG_FILE);
      return true;
    }
    if (v === 4 || v === 12) await ensureFtpAlive();
    await sleep(5000);
  }

  logPs5(TAG, `❌ VERIFICACIÓN FTP FALLÓ: [${titleId}] NO se encontró en PS5 (${category}).`, LOG_FILE);
  return false;
}

async function installPkg(pkgPath, dryRun = false) {
  const filename = path.basename(pkgPath);
  const audit = validatePkg(pkgPath);

  if (!audit.valid) {
    logPs5(TAG, `❌ AUDITORÍA RECHAZÓ ${filename}: ${audit.errors.join(' | ')}. Omitiendo.`, LOG_FILE);
    return false;
  }

  const category = audit.info.category || pkgRules.classifyPkg(filename);
  const sizeGb = (audit.info.sizeBytes / (1024 ** 3)).toFixed(2);
  logPs5(TAG, `▶️ Preparando: [${audit.info.titleId}] ${filename} (${category}, ${sizeGb} GB)`, LOG_FILE);

  if (dryRun) {
    console.log(`[DRY-RUN] Instalaría: ${filename} (${category}, ${sizeGb} GB)`);
    return true;
  }

  const fileUrl = `http://${cfg.ps5.pcIp}:${cfg.ps5.serverPort}/pkg/${encodeURIComponent(filename)}`;
  const installUrl = `http://${cfg.ps5.ip}:${cfg.ps5.installPort}/install?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(filename)}`;

  logPs5(TAG, `Inyectando comando a PS5 port 12800...`, LOG_FILE);
  const trigger = await httpGet(installUrl, 10000);

  if (!trigger || !trigger.body.toLowerCase().includes('ok')) {
    logPs5(TAG, `❌ Error en respuesta de PS5 al enviar ${filename}: ${trigger ? trigger.body : 'timeout'}`, LOG_FILE);
    return false;
  }

  logPs5(TAG, `🚀 PS5 aceptó el paquete. Transfiriendo e instalando...`, LOG_FILE);

  await sleep(5000);

  const completed = await waitForPkgTransfer(filename, audit.info.sizeBytes, audit.info.titleId, category);
  if (completed) {
    logPs5(TAG, `✅ INSTALACIÓN COMPLETADA Y VERIFICADA: ${filename}`, LOG_FILE);
    const installed = loadInstalledList();
    if (!installed.includes(filename)) {
      installed.push(filename);
      saveInstalledList(installed);
    }
    try {
      if (fs.existsSync(pkgPath)) {
        fs.unlinkSync(pkgPath);
        logPs5(TAG, `🗑️ Eliminado de PC tras verificar en PS5: ${filename}`, LOG_FILE);
        const pDir = path.dirname(pkgPath);
        if (fs.existsSync(pDir) && !fs.readdirSync(pDir).length && !LIB_DIRS.includes(pDir)) fs.rmdirSync(pDir);
      }
    } catch {}
    return true;
  } else {
    logPs5(TAG, `❌ Instalación de ${filename} falló o no superó la verificación.`, LOG_FILE);
    return false;
  }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const titleArgIdx = process.argv.indexOf('--title');
  const titleFilter = titleArgIdx >= 0 ? process.argv[titleArgIdx + 1].toUpperCase() : null;

  logPs5(TAG, `=== INICIO DE ORQUESTADOR LAN (FASE 2)${titleFilter ? ` [Filtro: ${titleFilter}]` : ''} ===`, LOG_FILE);

  const serverOk = await ensureServerRunning();
  if (!serverOk) {
    logPs5(TAG, '❌ No se pudo conectar al servidor LAN en puerto 9898. Abortando.', LOG_FILE);
    process.exit(1);
  }

  while (true) {
    let allPkgs = LIB_DIRS.flatMap((dir) => collectLibraryPkgs(dir, 3));
    if (titleFilter) {
      allPkgs = allPkgs.filter((p) => path.basename(p).toUpperCase().includes(titleFilter));
    }
    const installed = loadInstalledList();
    const { plan, held } = pkgRules.planInstallOrder(allPkgs, installed);

    logPs5(TAG, `Paquetes encontrados: ${allPkgs.length} | Pendientes por instalar: ${plan.length}`, LOG_FILE);
    if (held.length > 0) {
      logPs5(TAG, `Paquetes retenidos a la espera de Base: ${held.length}`, LOG_FILE);
    }

    if (plan.length === 0) {
      logPs5(TAG, '🎉 Todos los paquetes seleccionados ya están instalados y verificados en la PS5.', LOG_FILE);
      break;
    }

    let batchSuccessCount = 0;
    for (let i = 0; i < plan.length; i++) {
      const pkg = plan[i];
      logPs5(TAG, `--- Lote [${i + 1}/${plan.length}] ---`, LOG_FILE);
      const ok = await installPkg(pkg, isDryRun);
      if (!ok) {
        logPs5(TAG, `Pausando pipeline por fallo en paquete: ${path.basename(pkg)}`, LOG_FILE);
        return;
      }
      batchSuccessCount++;
      await sleep(3000);
    }

    if (isDryRun || batchSuccessCount === 0) break;
  }

  logPs5(TAG, '=== FIN DE CICLO DE INSTALACIÓN LAN ===', LOG_FILE);
}

if (require.main === module) {
  main().catch((err) => {
    logPs5(TAG, `Error fatal: ${err.message}`, LOG_FILE);
    process.exit(1);
  });
}

module.exports = { collectLibraryPkgs, installPkg };
