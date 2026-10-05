/**
 * @file config.js
 * @description SSOT de configuración del pipeline PS5 (PC ↔ consola por LAN).
 *   Los defaults reflejan la máquina de Jeiser; se pueden sobreescribir por
 *   variables de entorno (PS5_*) o por data/cache/ps5/config.json.
 * SRP < 300L.
 */
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_DIR = path.join(ROOT, 'data', 'cache', 'ps5');
const LOG_FILE = path.join(ROOT, 'data', 'logs', 'ps5_pipeline.log');

const DEFAULTS = {
  ps5: {
    ip: '192.168.2.2',
    pcIp: '192.168.2.1',
    elfldrPort: 9021,
    installPort: 12800,
    serverPort: 9898,
  },
  paths: {
    watchDir: 'C:\\Users\\dev\\Desktop',
    libraryDirs: ['C:\\Biblioteca_Juegos_PS', 'E:\\Biblioteca_Juegos_PS'],
    idmDataDir: 'C:\\Users\\dev\\AppData\\Roaming\\IDM\\DwnlData\\dev',
    idmExe: 'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe',
    braveExe: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    winrarExe: 'C:\\Program Files\\WinRAR\\WinRAR.exe',
    sevenZipExe: 'C:\\Program Files\\7-Zip\\7z.exe',
  },
  queue: {
    pollMs: 30000,
    idmActiveWindowMs: 25000,
    maxAttempts: 4,
    backoffBaseMs: 120000,
    backoffMaxMs: 1800000,
  },
  archivePasswords: ['DLPSGAME.COM', 'hako', 'downloadgameps3.com'],
  state: {
    cacheDir: CACHE_DIR,
    logFile: LOG_FILE,
    queueFile: path.join(CACHE_DIR, 'queue_state.json'),
    installedFile: path.join(CACHE_DIR, 'installed_pkgs.json'),
  },
};

/**
 * @param {Record<string, any>} base
 * @param {Record<string, any>} override
 * @returns {Record<string, any>}
 */
function deepMerge(base, override) {
  const out = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    const current = out[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && current && typeof current === 'object' && !Array.isArray(current)) {
      out[key] = deepMerge(current, value);
    } else if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Overrides por variables de entorno (prefijo PS5_).
 * @param {Record<string, any>} cfg
 * @returns {Record<string, any>}
 */
function applyEnv(cfg) {
  const out = { ...cfg, paths: { ...cfg.paths }, ps5: { ...cfg.ps5 }, queue: { ...cfg.queue } };
  if (process.env.PS5_IP) out.ps5.ip = process.env.PS5_IP;
  if (process.env.PS5_PC_IP) out.ps5.pcIp = process.env.PS5_PC_IP;
  if (process.env.PS5_DESKTOP) out.paths.watchDir = process.env.PS5_DESKTOP;
  if (process.env.PS5_LIBRARY_DIRS) out.paths.libraryDirs = process.env.PS5_LIBRARY_DIRS.split(';').filter(Boolean);
  if (process.env.PS5_IDM_DIR) out.paths.idmDataDir = process.env.PS5_IDM_DIR;
  if (process.env.PS5_BRAVE_EXE) out.paths.braveExe = process.env.PS5_BRAVE_EXE;
  if (process.env.PS5_WINRAR_EXE) out.paths.winrarExe = process.env.PS5_WINRAR_EXE;
  if (process.env.PS5_7ZIP_EXE) out.paths.sevenZipExe = process.env.PS5_7ZIP_EXE;
  if (process.env.PS5_POLL_MS) out.queue.pollMs = Number(process.env.PS5_POLL_MS);
  return out;
}

/**
 * Lee el override opcional de disco (data/cache/ps5/config.json).
 * @returns {Record<string, any>}
 */
function readFileOverride() {
  const file = path.join(CACHE_DIR, 'config.json');
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/** @type {Record<string, any> | null} */
let cached = null;

/**
 * @returns {Record<string, any>}
 */
function getPs5Config() {
  if (!cached) {
    cached = applyEnv(deepMerge(DEFAULTS, readFileOverride()));
  }
  return cached;
}

module.exports = { getPs5Config };
