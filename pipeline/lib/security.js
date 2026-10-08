/**
 * @file security.js
 * @description Módulo de seguridad y sanitización estricta anti-path-traversal.
 *   Utilizado en producción por server.js, lan_installer.js y aria_pilot.js.
 * SRP < 100L. Cero dependencias externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Sanitiza un nombre de archivo eliminando path traversal, slashes y metacaracteres.
 * @param {string} input
 * @returns {string}
 */
function sanitizeFilename(input) {
  if (typeof input !== 'string') return '';
  let decoded = input;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    // Si no es URL-encoded válido, conservar input
  }
  // 1. Extraer nombre base estricto (elimina ../ y ..\)
  const base = path.basename(decoded);
  // 2. Filtrar caracteres prohibidos en nombres de PKG / shell
  return base.replace(/[^a-zA-Z0-9._\-+()[\] ]/g, '').trim();
}

/**
 * Verifica si un path resuelto reside estrictamente dentro de un directorio padre.
 * @param {string} parentDir
 * @param {string} targetPath
 * @returns {boolean}
 */
function isPathInside(parentDir, targetPath) {
  if (!parentDir || !targetPath) return false;
  const resolvedParent = path.resolve(parentDir);
  const resolvedTarget = path.resolve(targetPath);
  return resolvedTarget.startsWith(resolvedParent + path.sep) || resolvedTarget === resolvedParent;
}

/**
 * Verifica si un path reside dentro de un directorio padre resolviendo symlinks/junctions reales.
 * @param {string} parentDir
 * @param {string} targetPath
 * @returns {boolean}
 */
function isRealPathInside(parentDir, targetPath) {
  if (!parentDir || !targetPath) return false;
  try {
    if (!fs.existsSync(parentDir) || !fs.existsSync(targetPath)) return false;
    const realParent = fs.realpathSync(parentDir);
    const realTarget = fs.realpathSync(targetPath);
    return realTarget.startsWith(realParent + path.sep) || realTarget === realParent;
  } catch {
    return false;
  }
}

module.exports = {
  sanitizeFilename,
  isPathInside,
  isRealPathInside,
};
