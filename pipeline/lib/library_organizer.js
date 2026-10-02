/**
 * @file library_organizer.js
 * @description Gestor organizador de carpetas y jerarquía de biblioteca PS4/PS5.
 *   Agrupa juegos en C:\Biblioteca_Juegos_PS\<Título> (<TitleID>)\ manteniendo
 *   juntos el Base game, Updates, DLCs y Fixes, listo para compartir e instalar.
 * SRP < 300L. Cero dependencias externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { logPs5 } = require('./pipeline_log.js');

const TAG = 'ORGANIZER';

/**
 * Sanitiza un string para usarlo de forma segura como nombre de carpeta en Windows.
 * @param {string} name
 * @returns {string}
 */
function sanitizeFolderName(name) {
  if (!name || typeof name !== 'string') return 'Juego_Desconocido';
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Encuentra o crea la carpeta designada para un TitleID en la biblioteca.
 * @param {string} baseDir Carpeta raíz (ej: C:\Biblioteca_Juegos_PS)
 * @param {string} title Título del juego
 * @param {string} titleId ID del juego (ej: CUSA34386)
 * @returns {string} Ruta absoluta de la carpeta del juego
 */
function resolveGameFolder(baseDir, title, titleId) {
  fs.mkdirSync(baseDir, { recursive: true });

  const safeTitleId = (titleId || '').trim().toUpperCase();

  // 1. Buscar si ya existe una carpeta con este TitleID entre paréntesis
  if (safeTitleId && safeTitleId !== 'UNKNOWN') {
    try {
      const entries = fs.readdirSync(baseDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const upper = entry.name.toUpperCase();
          if (upper.includes(`(${safeTitleId})`) || upper.endsWith(`_${safeTitleId}`) || upper === safeTitleId) {
            return path.join(baseDir, entry.name);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 2. Si no existe, crear nombre estándar: <Título> (<TitleID>)
  const cleanTitle = sanitizeFolderName(title) || 'PlayStation Game';
  const folderName = safeTitleId && safeTitleId !== 'UNKNOWN' ? `${cleanTitle} (${safeTitleId})` : cleanTitle;
  const targetDir = path.join(baseDir, folderName);
  fs.mkdirSync(targetDir, { recursive: true });
  return targetDir;
}

/**
 * Mueve un archivo de forma segura a su carpeta de juego.
 * Maneja transferencias atómicas dentro de la misma unidad y fallback para cruce de unidades.
 * @param {string} sourceFile Ruta actual del archivo
 * @param {string} targetDir Carpeta destino
 * @param {string} [logFile]
 * @returns {{ success: boolean, destPath: string, error?: string }}
 */
function moveFileToGameFolder(sourceFile, targetDir, logFile) {
  try {
    fs.mkdirSync(targetDir, { recursive: true });
    const filename = path.basename(sourceFile);
    const destPath = path.join(targetDir, filename);

    if (path.resolve(sourceFile) === path.resolve(destPath)) {
      return { success: true, destPath };
    }

    // Si ya existe en destino con el mismo tamaño, no duplicar
    if (fs.existsSync(destPath)) {
      const srcStat = fs.statSync(sourceFile);
      const dstStat = fs.statSync(destPath);
      if (srcStat.size === dstStat.size) {
        try {
          fs.unlinkSync(sourceFile);
        } catch {}
        logPs5(TAG, `Archivo idéntico ya presente en destino: ${destPath}`, logFile);
        return { success: true, destPath };
      }
    }

    try {
      // renameSync es atómico si es el mismo disco
      fs.renameSync(sourceFile, destPath);
    } catch (renameErr) {
      if (renameErr.code === 'EXDEV') {
        // Cruce de discos: copia y borrado
        fs.copyFileSync(sourceFile, destPath);
        fs.unlinkSync(sourceFile);
      } else {
        throw renameErr;
      }
    }

    logPs5(TAG, `📁 Archivo organizado: ${filename} ➔ ${targetDir}`, logFile);
    return { success: true, destPath };
  } catch (err) {
    const errorMsg = `Error moviendo ${path.basename(sourceFile)}: ${err.message}`;
    logPs5(TAG, `❌ ${errorMsg}`, logFile);
    return { success: false, destPath: '', error: errorMsg };
  }
}

module.exports = {
  sanitizeFolderName,
  resolveGameFolder,
  moveFileToGameFolder,
};
