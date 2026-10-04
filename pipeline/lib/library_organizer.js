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
        const srcStat = fs.statSync(sourceFile);
        const targetRoot = path.parse(path.resolve(destPath)).root;
        const targetStats = fs.statfsSync(targetRoot);
        const targetFree = targetStats.bfree * targetStats.bsize;
        if (targetFree < srcStat.size + (20 * 1024 ** 3)) {
          throw new Error(`Espacio insuficiente en ${targetRoot} para recibir ${(srcStat.size / (1024 ** 3)).toFixed(1)} GB (reserva mínima < 20 GB)`);
        }
        fs.copyFileSync(sourceFile, destPath);
        const dstStat = fs.statSync(destPath);
        if (srcStat.size !== dstStat.size) {
          try { fs.unlinkSync(destPath); } catch {}
          throw new Error(`Copia truncada entre discos: ${dstStat.size} !== ${srcStat.size}`);
        }
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

/**
 * Obtiene el espacio libre en GB de una unidad dada.
 * @param {string} drive Letra de unidad (ej: 'E:\\', 'C:\\')
 * @returns {number}
 */
function getDiskFreeGb(drive) {
  try {
    const s = fs.statfsSync(drive);
    return (s.bfree * s.bsize) / (1024 ** 3);
  } catch {
    return 0;
  }
}

/**
 * Determina inteligentemente el mejor destino para balancear carga entre discos.
 * Mantiene amortiguador de seguridad en E: (mínimo 160 GB) para IDM y descompresión.
 * Si C: tiene más espacio libre, balancea hacia C:\Biblioteca_Juegos_PS.
 * @param {string} sourcePath Ruta origen del archivo
 * @param {string} [logFile]
 * @returns {string} Ruta de la biblioteca destino
 */
function getBestTargetLibrary(sourcePath, logFile) {
  try {
    const freeE = getDiskFreeGb('E:\\');
    const freeC = getDiskFreeGb('C:\\');

    // 1. Si el archivo ya cayó en C:, mantenerlo en C:
    if (path.resolve(sourcePath).toUpperCase().startsWith('C:')) {
      return 'C:\\Biblioteca_Juegos_PS';
    }

    // 2. Si E: baja del umbral de amortiguación (160 GB) y C: tiene espacio (> 120 GB), proteger E:
    if (freeE < 160 && freeC > 120) {
      logPs5(TAG, `⚖️ E: amortiguador bajo (${freeE.toFixed(1)} GB). Desviando juego a C: (${freeC.toFixed(1)} GB libres)`, logFile);
      return 'C:\\Biblioteca_Juegos_PS';
    }

    // 3. Balanceo simétrico: si C: tiene 50 GB más de margen libre que E:, equilibrar hacia C:
    if (freeC > freeE + 50 && freeC > 150) {
      logPs5(TAG, `⚖️ Balanceo proactivo: C: (${freeC.toFixed(1)} GB) > E: (${freeE.toFixed(1)} GB). Guardando en C:`, logFile);
      return 'C:\\Biblioteca_Juegos_PS';
    }

    return 'E:\\Biblioteca_Juegos_PS';
  } catch {
    return 'E:\\Biblioteca_Juegos_PS';
  }
}

/**
 * Migra proactivamente carpetas de juegos completas de E:\ a C:\ si E:\ necesita liberar espacio.
 * @param {string} [sourceLib]
 * @param {string} [targetLib]
 * @param {number} [triggerFreeGb] Umbral de disparo (si E: libre < triggerFreeGb)
 * @param {string} [logFile]
 * @returns {number} Cantidad de carpetas migradas
 */
function offloadCompletedGames(sourceLib = 'E:\\Biblioteca_Juegos_PS', targetLib = 'C:\\Biblioteca_Juegos_PS', triggerFreeGb = 160, logFile) {
  let migrated = 0;
  try {
    const freeE = getDiskFreeGb('E:\\');
    const freeC = getDiskFreeGb('C:\\');
    if (freeE >= triggerFreeGb || freeC <= 120 || !fs.existsSync(sourceLib)) return 0;

    const entries = fs.readdirSync(sourceLib, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory() || ent.name.startsWith('_')) continue;
      const srcFolder = path.join(sourceLib, ent.name);
      const dstFolder = path.join(targetLib, ent.name);

      logPs5(TAG, `🚀 Offload proactivo de carpeta: ${ent.name} (E: ➔ C:)`, logFile);
      const files = fs.readdirSync(srcFolder);
      let folderOk = true;
      for (const f of files) {
        const res = moveFileToGameFolder(path.join(srcFolder, f), dstFolder, logFile);
        if (!res.success) { folderOk = false; break; }
      }
      if (folderOk) {
        try { if (!fs.readdirSync(srcFolder).length) fs.rmdirSync(srcFolder); } catch {}
        migrated++;
      }
      // Detenerse si E: ya recuperó su colchón de seguridad
      if (getDiskFreeGb('E:\\') >= triggerFreeGb || getDiskFreeGb('C:\\') <= 120) break;
    }
  } catch (err) {
    logPs5(TAG, `Error en offloadCompletedGames: ${err.message}`, logFile);
  }
  return migrated;
}

module.exports = {
  sanitizeFolderName,
  resolveGameFolder,
  moveFileToGameFolder,
  getDiskFreeGb,
  getBestTargetLibrary,
  offloadCompletedGames,
};
