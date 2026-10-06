#!/usr/bin/env node
/**
 * @file idm_watcher.js
 * @description Monitoriza descargas activas en IDM y notifica por Telegram hitos y fin de cola.
 * Se auto-termina una vez la cola queda en 0.
 * SRP < 120L. Cero dependencias externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sendTelegramMessage } = require('../lib/telegram.js');

const IDM_DEV_DIR = 'C:\\Users\\dev\\AppData\\Roaming\\IDM\\DwnlData\\dev';
const POLL_INTERVAL_MS = 25000;

function getFilenameFromLog(folderPath) {
  try {
    const files = fs.readdirSync(folderPath);
    const logFile = files.find((f) => f.startsWith('log_') && f.endsWith('.log'));
    if (!logFile) return null;
    const content = fs.readFileSync(path.join(folderPath, logFile), 'utf8');
    const m = content.match(/Url\s+https?:\/\/[^\s\n\r]+\/download\/[^\s\n\r\/]+\/([^\s\n\r\?]+)/i);
    if (m && m[1]) return decodeURIComponent(m[1]);
  } catch {}
  return null;
}

function scanActiveDownloads() {
  if (!fs.existsSync(IDM_DEV_DIR)) return new Map();
  const entries = fs.readdirSync(IDM_DEV_DIR, { withFileTypes: true });
  const map = new Map();
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const folderPath = path.join(IDM_DEV_DIR, ent.name);
    const resolvedName = getFilenameFromLog(folderPath) || ent.name;
    map.set(ent.name, resolvedName);
  }
  return map;
}

async function run() {
  let knownDownloads = scanActiveDownloads();
  const totalInitial = knownDownloads.size;

  if (totalInitial === 0) {
    await sendTelegramMessage('ℹ️ *IDM Watcher:* No hay descargas activas en este momento.');
    process.exit(0);
  }

  await sendTelegramMessage(
    `🚀 *IDM Watcher Activo*\n` +
    `Monitoreando ${totalInitial} descargas activas en IDM.\n` +
    `Te avisaré por aquí cada vez que se complete un archivo y al finalizar la cola.`
  );

  const timer = setInterval(async () => {
    const currentDownloads = scanActiveDownloads();

    // Detectar descargas completadas
    for (const [folder, name] of knownDownloads.entries()) {
      if (!currentDownloads.has(folder)) {
        const remaining = currentDownloads.size;
        await sendTelegramMessage(
          `✅ *IDM Descarga Lista*\n` +
          `📦 \`${name}\`\n` +
          `⏳ Restan: ${remaining} archivos en cola.`
        );
      }
    }

    knownDownloads = currentDownloads;

    if (currentDownloads.size === 0) {
      clearInterval(timer);
      await sendTelegramMessage(
        `🎉 *IDM Cola Finalizada*\n` +
        `¡Todas las descargas (${totalInitial}/${totalInitial}) han finalizado con éxito en el PC!`
      );
      process.exit(0);
    }
  }, POLL_INTERVAL_MS);
}

run().catch(async (err) => {
  await sendTelegramMessage(`⚠️ *IDM Watcher Error:* ${err.message}`).catch(() => {});
  process.exit(1);
});
