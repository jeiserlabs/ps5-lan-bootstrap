/**
 * @file pidfile.js
 * @description Pidfile atómico para daemons del pipeline PS5: evita instancias duplicadas
 *   mediante exclusión mutua a nivel de sistema de archivos (flag 'wx' anti-TOCTOU).
 * SRP < 100L. Cero dependencias externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Lee el PID y verifica si el proceso está actualmente vivo en el sistema operativo.
 * @param {string} file
 * @returns {number|null} pid vivo o null
 */
function readAlivePid(file) {
  if (!fs.existsSync(file)) return null;
  try {
    const content = fs.readFileSync(file, 'utf8').trim();
    const pid = Number(content);
    if (!pid || isNaN(pid)) return null;
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

/**
 * Toma el lock de forma estrictamente atómica usando creación exclusiva ('wx').
 * Si el archivo ya existe y el proceso sigue vivo, retorna false inmediatamente.
 * Si el lock está huérfano (proceso muerto), lo limpia y reintenta adquisición atómica.
 * @param {string} file
 * @returns {boolean}
 */
function acquirePid(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
    return true;
  } catch (err) {
    if (err.code === 'EEXIST') {
      const alivePid = readAlivePid(file);
      if (alivePid) {
        return false;
      }
      try {
        fs.unlinkSync(file);
        fs.writeFileSync(file, String(process.pid), { flag: 'wx' });
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Libera el pidfile únicamente si pertenece al proceso actual.
 * @param {string} file
 */
function releasePid(file) {
  try {
    const pid = Number(fs.readFileSync(file, 'utf8').trim());
    if (pid === process.pid) {
      fs.unlinkSync(file);
    }
  } catch {
    // Sin pidfile no hay nada que liberar
  }
}

module.exports = { acquirePid, releasePid, readAlivePid };
