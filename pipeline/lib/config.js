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

function loadArchivePasswords() {
  if (process.env.PS5_ARCHIVE_PASSWORDS) {
    return process.env.PS5_ARCHIVE_PASSWORDS.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }
  const passFile = path.join(ROOT, '.passwords');
  if (fs.existsSync(passFile)) {
    try {
      return fs.readFileSync(passFile, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    } catch {}
  }
  return [];
}

const defaultDesktop = process.env.PS5_DESKTOP || path.join(process.env.USERPROFILE || 'C:\\Users\\dev', 'Desktop');

const DEFAULTS = {
  ps5: {
    ip: '192.168.2.2',
    pcIp: '192.168.2.1',
    elfldrPort: 9021,
    installPort: 12800,
    serverPort: 9898,
    firmware: '13.40',
  },
  paths: {
    watchDir: defaultDesktop,
    watchDirs: [defaultDesktop, path.join(defaultDesktop, 'DESCARGAS TELEGRAM')],
    libraryDirs: ['C:\\Biblioteca_Juegos_PS', 'E:\\Biblioteca_Juegos_PS', path.join(defaultDesktop, 'DESCARGAS TELEGRAM'), defaultDesktop],
    stagingDir: path.join(ROOT, 'staging'),
    braveProfileDir: path.join(ROOT, 'data', 'browser_profiles', 'brave_aria_profile'),
    braveExe: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    winrarExe: 'C:\\Program Files\\WinRAR\\WinRAR.exe',
    sevenZipExe: 'C:\\Program Files\\7-Zip\\7z.exe',
  },
  queue: {
    pollMs: 30000,
    ariaActiveWindowMs: 25000,
    maxAttempts: 4,
    backoffBaseMs: 120000,
    backoffMaxMs: 1800000,
  },
  archivePasswords: loadArchivePasswords(),
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
  if (process.env.PS5_FIRMWARE) out.ps5.firmware = process.env.PS5_FIRMWARE;
  if (process.env.PS5_DESKTOP) out.paths.watchDir = process.env.PS5_DESKTOP;
  if (process.env.PS5_WATCH_DIRS) {
    out.paths.watchDirs = process.env.PS5_WATCH_DIRS.split(';').filter(Boolean);
    if (out.paths.watchDirs.length > 0) out.paths.watchDir = out.paths.watchDirs[0];
  } else if (process.env.PS5_DESKTOP) {
    out.paths.watchDirs = [process.env.PS5_DESKTOP];
  }
  if (process.env.PS5_LIBRARY_DIRS) out.paths.libraryDirs = process.env.PS5_LIBRARY_DIRS.split(';').filter(Boolean);
  if (process.env.PS5_STAGING) out.paths.stagingDir = process.env.PS5_STAGING;
  if (process.env.PS5_BRAVE_PROFILE) out.paths.braveProfileDir = process.env.PS5_BRAVE_PROFILE;
  if (process.env.PS5_BRAVE_EXE) out.paths.braveExe = process.env.PS5_BRAVE_EXE;
  if (process.env.PS5_WINRAR_EXE) out.paths.winrarExe = process.env.PS5_WINRAR_EXE;
  if (process.env.PS5_7ZIP_EXE) out.paths.sevenZipExe = process.env.PS5_7ZIP_EXE;
  if (process.env.PS5_POLL_MS) out.queue.pollMs = Number(process.env.PS5_POLL_MS);
  if (process.env.PS5_ARCHIVE_PASSWORDS) {
    out.archivePasswords = process.env.PS5_ARCHIVE_PASSWORDS.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }
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
