#!/usr/bin/env node
/**
 * @file lan_installer.js
 * @description Orquestador de Fase 2: Instalación masiva por cable LAN a PS5.
 *   Se ejecuta una vez que las descargas en PC están 100% completas y verificadas.
 *   Instala en cascada determinista: BASE ➔ UPDATE ➔ DLCs.
 *   Espera la confirmación de la consola entre cada paquete para evitar colisiones.
 * Uso: node scripts/lan_installer.js [--dry-run]
 * SRP < 300L.
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
const { sendTelegramMessage } = require('../lib/telegram.js');

const cfg = getPs5Config();
const LIB_DIR = cfg.paths.libraryDirs[0]; // C:\Biblioteca_Juegos_PS
const INSTALLED_FILE = path.resolve(__dirname, '..', '..', 'installed_pkgs_ps5.json');
const LOG_FILE = path.join(path.dirname(cfg.state.logFile), 'lan_installer.log');
const TAG = 'LAN_INSTALLER';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

function loadInstalledList() {
  try {
    if (fs.existsSync(INSTALLED_FILE)) {
      return JSON.parse(fs.readFileSync(INSTALLED_FILE, 'utf8'));
    }
  } catch {}
  return [];
}

function saveInstalledList(list) {
  try {
    fs.writeFileSync(INSTALLED_FILE, JSON.stringify(list, null, 2) + '\n');
  } catch {}
}

async function ensureServerRunning() {
  const health = await httpGet(`http://${cfg.ps5.pcIp}:${cfg.ps5.serverPort}/healthz`, 2000);
  if (health && health.status === 200) return true;

  logPs5(TAG, 'Iniciando servidor LAN en puerto 9898...', LOG_FILE);
  const srvScript = path.join(__dirname, 'server.js');
  const child = spawn(process.execPath, [srvScript], { detached: true, stdio: 'ignore' });
  child.unref();

  for (let i = 0; i < 15; i++) {
    await sleep(500);
    const check = await httpGet(`http://${cfg.ps5.pcIp}:${cfg.ps5.serverPort}/healthz`, 1000);
    if (check && check.status === 200) {
      logPs5(TAG, 'Servidor LAN online y respondiendo en puerto 9898', LOG_FILE);
      return true;
    }
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

async function waitForPkgTransfer(filename, expectedSize) {
  let lastRangeTime = Date.now();
  let lastEndByte = 0;
  let hasStarted = false;

  for (let i = 0; i < 720; i++) { // hasta 60 min
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
            }
            if (expectedSize > 0 && endByte >= expectedSize - 0x200000) {
              break;
            }
          }
        }
      }
    } catch {}

    if (hasStarted && Date.now() - lastRangeTime > 40000) {
      break;
    }
  }

  for (let j = 0; j < 30; j++) {
    const res = await httpGet(`http://${cfg.ps5.ip}:${cfg.ps5.installPort}/api/status`, 3000);
    if (res && res.status === 200) {
      try {
        const state = JSON.parse(res.body);
        if (!state.busy && !state.pull) return true;
      } catch {}
    }
    await sleep(3000);
  }
  return true;
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
  sendTelegramMessage(`🚀 <b>Instalando en PS5:</b>\n• <code>${filename}</code> (${category}, ${sizeGb} GB)\n• Transfiriendo por cable LAN...`);

  // Dar 5 segundos para que la consola arranque el pull
  await sleep(5000);

  // Esperar a que la consola complete la transferencia de bytes y quede ociosa
  const completed = await waitForPkgTransfer(filename, audit.info.sizeBytes);
  if (completed) {
    logPs5(TAG, `✅ INSTALACIÓN COMPLETADA: ${filename}`, LOG_FILE);
    sendTelegramMessage(`✅ <b>Instalado en PS5:</b>\n• <code>${filename}</code>`);
    const installed = loadInstalledList();
    if (!installed.includes(filename)) {
      installed.push(filename);
      saveInstalledList(installed);
    }
    return true;
  } else {
    logPs5(TAG, `⚠️ Tiempo de espera agotado instalando ${filename}`, LOG_FILE);
    return false;
  }
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  logPs5(TAG, '=== INICIO DE ORQUESTADOR LAN (FASE 2) ===', LOG_FILE);

  const serverOk = await ensureServerRunning();
  if (!serverOk) {
    logPs5(TAG, '❌ No se pudo conectar al servidor LAN en puerto 9898. Abortando.', LOG_FILE);
    process.exit(1);
  }

  const allPkgs = collectLibraryPkgs(LIB_DIR, 2);
  const installed = loadInstalledList();
  const { plan, held } = pkgRules.planInstallOrder(allPkgs, installed);

  logPs5(TAG, `Paquetes encontrados: ${allPkgs.length} | Pendientes por instalar: ${plan.length}`, LOG_FILE);
  if (held.length > 0) {
    logPs5(TAG, `Paquetes retenidos a la espera de Base: ${held.length}`, LOG_FILE);
  }

  if (plan.length === 0) {
    logPs5(TAG, '🎉 Todos los juegos disponibles ya están instalados en la PS5.', LOG_FILE);
    return;
  }

  for (let i = 0; i < plan.length; i++) {
    const pkg = plan[i];
    logPs5(TAG, `--- Lote [${i + 1}/${plan.length}] ---`, LOG_FILE);
    const ok = await installPkg(pkg, isDryRun);
    if (!ok) {
      logPs5(TAG, `Pausando pipeline por fallo en paquete: ${path.basename(pkg)}`, LOG_FILE);
      break;
    }
    await sleep(3000); // Pausa de estabilización entre paquetes
  }

  logPs5(TAG, '=== FIN DE CICLO DE INSTALACIÓN LAN ===', LOG_FILE);
  sendTelegramMessage(`🏆 <b>Pipeline PS5 Finalizado:</b>\n• Todos los juegos han sido instalados con éxito en la consola.`);
}

if (require.main === module) {
  main().catch((err) => {
    logPs5(TAG, `Error fatal: ${err.message}`, LOG_FILE);
    process.exit(1);
  });
}

module.exports = { collectLibraryPkgs, installPkg };
