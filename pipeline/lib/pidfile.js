/**
 * @file pidfile.js
 * @description Pidfile simple para daemons del pipeline PS5: evita instancias duplicadas
 *   (causa histórica de doble descarga y doble instalación con el scratch de Antigravity).
 * SRP < 300L.
 */
const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} file
 * @returns {number|null} pid vivo o null
 */
function readAlivePid(file) {
  if (!fs.existsSync(file)) return null;
  const pid = Number(fs.readFileSync(file, 'utf8').trim());
  if (!pid) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

/**
 * Toma el lock. Si ya hay una instancia viva, retorna false.
 * @param {string} file
 * @returns {boolean}
 */
function acquirePid(file) {
  if (readAlivePid(file)) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, String(process.pid));
  return true;
}

/**
 * Libera el pidfile si es de este proceso.
 * @param {string} file
 */
function releasePid(file) {
  try {
    const pid = Number(fs.readFileSync(file, 'utf8').trim());
    if (pid === process.pid) fs.unlinkSync(file);
  } catch {
    // sin pidfile no hay nada que liberar
  }
}

module.exports = { acquirePid, releasePid, readAlivePid };
