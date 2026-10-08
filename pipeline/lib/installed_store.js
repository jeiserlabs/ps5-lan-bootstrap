/**
 * @file installed_store.js
 * @description Gestión atómica y persistencia de paquetes instalados en PS5 (installed_pkgs.json).
 * SRP < 100L.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { logPs5 } = require('./pipeline_log.js');

function loadInstalledList(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}

  // Fallback a .bak ante corrupción de sintaxis o semántica (ej. {})
  try {
    const bak = `${filePath}.bak`;
    if (fs.existsSync(bak)) {
      const parsedBak = JSON.parse(fs.readFileSync(bak, 'utf8'));
      if (Array.isArray(parsedBak)) return parsedBak;
    }
  } catch {}

  return [];
}

function saveInstalledList(filePath, list, logFile = null) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const content = JSON.stringify(list, null, 2) + '\n';
    const tmp = path.join(dir, `.${path.basename(filePath)}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`);
    fs.writeFileSync(tmp, content, 'utf8');
    if (fs.existsSync(filePath)) {
      try { fs.copyFileSync(filePath, `${filePath}.bak`); } catch {}
    }
    fs.renameSync(tmp, filePath);
    return true;
  } catch (err) {
    if (logFile) {
      logPs5('INSTALLED_STORE', `Error guardando lista de instalados: ${err.message}`, logFile);
    }
    return false;
  }
}

function recordInstalled(filePath, filename, logFile = null) {
  const installed = loadInstalledList(filePath);
  if (!installed.includes(filename)) {
    installed.push(filename);
    saveInstalledList(filePath, installed, logFile);
  }
  return installed;
}

module.exports = {
  loadInstalledList,
  saveInstalledList,
  recordInstalled,
};
