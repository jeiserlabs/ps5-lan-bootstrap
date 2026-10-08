#!/usr/bin/env node
/**
 * @file lan_installer.js - Instalación LAN a PS5 (BASE ➔ UPDATE ➔ DLCs).
 * SRP < 300L. Cero dependencias externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { getPs5Config } = require('../lib/config.js');
const { logPs5 } = require('../lib/pipeline_log.js');
const { validatePkg } = require('../lib/pkg_validator.js');
const pkgRules = require('../lib/pkg_rules.js');
const { checkCompatibility } = require('../lib/ps5_compatibility.js');
const { sanitizeFilename } = require('../lib/security.js');
const { ps5HttpGet, triggerPkgInstall } = require('../lib/ps5_client.js');
const { sendTelegramMessage } = require('../lib/telegram.js');
const { waitForPkgTransfer } = require('../lib/lan_watcher.js');
const { loadInstalledList, recordInstalled } = require('../lib/installed_store.js');

const cfg = getPs5Config();
const LIB_DIRS = cfg.paths.libraryDirs;
const INSTALLED_FILE = cfg.state.installedFile || path.join(cfg.state.cacheDir, 'installed_pkgs.json');
const LOG_FILE = path.join(path.dirname(cfg.state.logFile), 'lan_installer.log');
const TAG = 'LAN_INSTALLER';
// --keep-pc: instala y verifica pero NO borra el PKG del PC. El borrado
// post-instalación es el comportamiento por defecto (libera la biblioteca),
// pero es irreversible: úsalo cuando el PKG sea el único respaldo.
const KEEP_PC = process.argv.includes('--keep-pc');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const httpGet = ps5HttpGet;

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
    if (ent.isDirectory() && ent.name !== '_staging' && ent.name !== '_extracted') {
      pkgs.push(...collectLibraryPkgs(full, depth - 1));
    } else if (ent.name.toLowerCase().endsWith('.pkg')) {
      pkgs.push(full);
    }
  }
  return pkgs;
}


/**
 * Espacio libre real en la PS5 según el receiver (/api/space).
 * @returns {Promise<number>} bytes libres o -1 si no se pudo leer
 */
async function getPs5FreeBytes() {
  const res = await httpGet(`http://${cfg.ps5.ip}:${cfg.ps5.installPort}/api/space`, 4000);
  if (!res || res.status !== 200) return -1;
  try {
    const free = Number(JSON.parse(res.body).free);
    return Number.isFinite(free) ? free : -1;
  } catch {
    return -1;
  }
}

async function installPkg(pkgPath, dryRun = false) {
  const filename = sanitizeFilename(path.basename(pkgPath));

  // Guarda anti-mod (misma política que el daemon): los "ALL.DLC.MOD"/Unlock-All
  // pasan la auditoría estructural pero tumban la consola al abrir el juego
  // (caso CUSA11518 Mortal Kombat 11: base OK, update MOD → la PS5 se apaga).
  // Antes solo el daemon los filtraba; el orquestador LAN los instalaba igual.
  if (pkgRules.isModBlocked(filename)) {
    logPs5(TAG, `🚫 MOD bloqueado (no se instala): ${filename}`, LOG_FILE);
    if (!dryRun) {
      sendTelegramMessage(`🚫 *MOD bloqueado*: ${filename} no se instala (puede apagar la consola al abrir el juego).`);
    }
    return false;
  }

  const audit = validatePkg(pkgPath);

  if (!audit.valid) {
    logPs5(TAG, `❌ AUDITORÍA RECHAZÓ ${filename}: ${audit.errors.join(' | ')}. Omitiendo.`, LOG_FILE);
    return false;
  }

  const category = audit.info.category || pkgRules.classifyPkg(filename);
  const sizeGb = (audit.info.sizeBytes / (1024 ** 3)).toFixed(2);

  // Guarda de compatibilidad por evidencia local: un título con rechazo
  // determinista (mismo byte N veces con disco libre) NO se reintenta; los
  // reportes de foros sin verificar solo dejan aviso en el log.
  const compat = checkCompatibility(audit.info.titleId);
  if (!compat.compatible && category !== 'DLC') {
    logPs5(TAG, `⛔ TÍTULO BLOQUEADO (${compat.titleId}): ${compat.reason} → ${compat.action} Omitido SIN descargar.`, LOG_FILE);
    if (!dryRun) sendTelegramMessage(`⛔ *PS5 título bloqueado*: [${compat.titleId}] ${compat.reason}\n${compat.action}`);
    return false;
  }
  if (compat.severity === 'warn') {
    logPs5(TAG, `⚠️ Compatibilidad dudosa (${compat.titleId}): ${compat.reason} → ${compat.action}`, LOG_FILE);
  }

  logPs5(TAG, `▶️ Preparando: [${audit.info.titleId}] ${filename} (${category}, ${sizeGb} GB)`, LOG_FILE);

  if (dryRun) {
    console.log(`[DRY-RUN] Instalaría: ${filename} (${category}, ${sizeGb} GB)`);
    return true;
  }

  // Guarda anti-desbordamiento: el receiver escribe el PKG completo antes de
  // instalar, así que el pico es ~2x el PKG. Sin esta guarda el orquestador
  // llenaba el SSD (fallos previos a los 13.19 y 84.96 GB con el disco a 0
  // bytes libres) y moría por timeout tras 20 minutos de transferencia.
  const freeBytes = await getPs5FreeBytes();
  const neededBytes = pkgRules.requiredHeadroomBytes(audit.info.sizeBytes, category);
  if (freeBytes >= 0 && neededBytes > 0 && freeBytes < neededBytes) {
    logPs5(
      TAG,
      `⛔ ESPACIO INSUFICIENTE en PS5 para ${filename}: libre ${(freeBytes / 1e9).toFixed(1)} GB < requerido ${(neededBytes / 1e9).toFixed(1)} GB (PKG ${(audit.info.sizeBytes / 1e9).toFixed(1)} GB). Omitido SIN descargar.`,
      LOG_FILE,
    );
    sendTelegramMessage(
      `⛔ *PS5 sin espacio*: ${filename} necesita ~${(neededBytes / 1e9).toFixed(1)} GB libres y hay ${(freeBytes / 1e9).toFixed(1)} GB. No se descarga para no llenar el SSD.`,
    );
    return false;
  }
  if (freeBytes < 0) {
    logPs5(
      TAG,
      `⛔ NO SE PUDO LEER ESPACIO en PS5 (/api/space falló o timeout) para ${filename}. Omitido por seguridad (fail-closed estricto).`,
      LOG_FILE,
    );
    sendTelegramMessage(`⛔ *PS5 espacio desconocido*: No se pudo verificar espacio para ${filename}. Cancelado por seguridad (fail-closed).`);
    return false;
  }
  logPs5(TAG, `Espacio libre en PS5: ${(freeBytes / 1e9).toFixed(1)} GB (mínimo requerido ${(neededBytes / 1e9).toFixed(1)} GB) ✔`, LOG_FILE);

  const fileUrl = `http://${cfg.ps5.pcIp}:${cfg.ps5.serverPort}/pkg/${encodeURIComponent(filename)}`;

  logPs5(TAG, `Inyectando comando a PS5 port 12800...`, LOG_FILE);
  const trigger = await triggerPkgInstall(cfg.ps5.ip, cfg.ps5.installPort, fileUrl, filename, 10000);

  if (!trigger || !trigger.ok) {
    logPs5(TAG, `❌ Error en respuesta de PS5 al enviar ${filename}: ${trigger ? (trigger.error || JSON.stringify(trigger.data || trigger.raw || '')) : 'timeout'}`, LOG_FILE);
    return false;
  }

  logPs5(TAG, `🚀 PS5 aceptó el paquete. Transfiriendo e instalando...`, LOG_FILE);
  await sleep(5000);

  const completed = await waitForPkgTransfer(
    filename,
    audit.info.sizeBytes,
    audit.info.titleId,
    category,
    audit.info.contentId,
    cfg,
    TAG,
    LOG_FILE,
  );
  if (completed) {
    logPs5(TAG, `✅ INSTALACIÓN COMPLETADA Y VERIFICADA: ${filename}`, LOG_FILE);
    recordInstalled(INSTALLED_FILE, filename, LOG_FILE);
    if (!dryRun && (audit.info.sizeBytes > 1024 * 1024 * 1024 || category === 'BASE')) {
      sendTelegramMessage(`✅ *PS5 Instalado*: [${audit.info.titleId}] ${filename} (${sizeGb} GB) verificado en consola.`);
    }
    if (KEEP_PC) {
      logPs5(TAG, `📁 Conservado en PC (--keep-pc): ${filename}`, LOG_FILE);
      return true;
    }
    try {
      if (fs.existsSync(pkgPath)) {
        fs.unlinkSync(pkgPath);
        if (fs.existsSync(pkgPath)) {
          throw new Error('el archivo sigue existiendo tras unlink (posible handle abierto del servidor)');
        }
        logPs5(TAG, `🗑️ Eliminado de PC tras verificar en PS5: ${filename}`, LOG_FILE);
        const pDir = path.dirname(pkgPath);
        try {
          if (fs.existsSync(pDir) && !fs.readdirSync(pDir).length && !LIB_DIRS.includes(pDir)) fs.rmdirSync(pDir);
        } catch {}
      }
    } catch (err) {
      logPs5(TAG, `⚠️ INSTALADO en PS5 pero NO se pudo borrar del PC (borrar manual): ${filename} — ${err.message}`, LOG_FILE);
      sendTelegramMessage(`⚠️ *PS5 Aviso*: [${audit.info.titleId}] ${filename} instalado pero sigue en PC (bórralo manual).`);
    }
    return true;
  }
  logPs5(TAG, `❌ Instalación de ${filename} falló o no superó la verificación.`, LOG_FILE);
  if (!dryRun) sendTelegramMessage(`❌ *PS5 Error*: Falló verificación de [${audit.info.titleId}] ${filename}.`);
  return false;
}

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  const titleArgIdx = process.argv.indexOf('--title');
  const titleFilter = titleArgIdx >= 0 ? process.argv[titleArgIdx + 1].toUpperCase() : null;
  logPs5(
    TAG,
    `=== INICIO DE ORQUESTADOR LAN (FASE 2)${titleFilter ? ` [Filtro: ${titleFilter}]` : ''}${KEEP_PC ? ' [keep-pc]' : ''} ===`,
    LOG_FILE,
  );

  const serverOk = await ensureServerRunning();
  if (!serverOk) {
    logPs5(TAG, '❌ No se pudo conectar al servidor LAN en puerto 9898. Abortando.', LOG_FILE);
    process.exit(1);
  }

  const failedSet = new Set();
  while (true) {
    let allPkgs = LIB_DIRS.flatMap((dir) => collectLibraryPkgs(dir, 3));
    if (titleFilter) allPkgs = allPkgs.filter((p) => p.toUpperCase().includes(titleFilter) || path.basename(p).toUpperCase().includes(titleFilter));
    const installed = loadInstalledList(INSTALLED_FILE);
    const { plan: rawPlan, held } = pkgRules.planInstallOrder(allPkgs, installed);
    const plan = rawPlan.filter((p) => !failedSet.has(path.basename(p)));
    // Cascada primero (BASE → FIX → UPDATE → DLC) y, dentro de cada categoría,
    // el más liviano primero. Ordenar solo por tamaño ponía los DLC de 0.5 MB
    // antes que el UPDATE del mismo título.
    plan.sort((a, b) => {
      const pa = pkgRules.installPriority(a);
      const pb = pkgRules.installPriority(b);
      if (pa !== pb) return pa - pb;
      try { return fs.statSync(a).size - fs.statSync(b).size; } catch { return 0; }
    });

    logPs5(TAG, `Paquetes: ${allPkgs.length} | Pendientes: ${plan.length} | Omitidos: ${failedSet.size}`, LOG_FILE);
    if (held.length > 0) logPs5(TAG, `Retenidos a la espera de Base: ${held.length}`, LOG_FILE);
    if (plan.length === 0) {
      logPs5(TAG, '🎉 Todos los paquetes seleccionados ya están instalados/procesados.', LOG_FILE);
      if (!isDryRun) sendTelegramMessage('🎉 *PS5 LAN Pipeline*: Todos los paquetes pendientes están instalados.');
      break;
    }

    if (!isDryRun) sendTelegramMessage(`🚀 *PS5 LAN Pipeline*: Lote de ${plan.length} paquetes...`);
    let batchSuccessCount = 0;
    for (let i = 0; i < plan.length; i++) {
      const pkg = plan[i];
      logPs5(TAG, `--- Lote [${i + 1}/${plan.length}] ---`, LOG_FILE);
      const ok = await installPkg(pkg, isDryRun);
      if (!ok) {
        failedSet.add(path.basename(pkg));
        logPs5(TAG, `⚠️ Omitiendo paquete fallido y continuando: ${path.basename(pkg)}`, LOG_FILE);
        continue;
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
