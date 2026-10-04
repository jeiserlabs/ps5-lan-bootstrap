/**
 * @file archive_extractor.js
 * @description Extractor automático y resiliente de archivos comprimidos (RAR/ZIP)
 *   para el pipeline de juegos PS4/PS5 usando 7-Zip o UnRAR con auto-detección
 *   de contraseña (DLPSGAME.COM, etc.) y manejo de archivos multi-parte.
 * SRP < 300L. Cero dependencias externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getPs5Config } = require('./config.js');
const { logPs5 } = require('./pipeline_log.js');

const cfg = getPs5Config();
const SEVEN_ZIP = cfg.paths.sevenZipExe || 'C:\\Program Files\\7-Zip\\7z.exe';
const UNRAR_EXE = cfg.paths.winrarExe ? path.join(path.dirname(cfg.paths.winrarExe), 'UnRAR.exe') : 'C:\\Program Files\\WinRAR\\UnRAR.exe';
const PASSWORDS = cfg.archivePasswords || ['DLPSGAME.COM', 'hako', 'downloadgameps3.com'];
const TAG = 'EXTRACTOR';

/**
 * Detecta si un archivo es parte de un archivo multi-volumen.
 * @param {string} filename
 * @returns {{ isMultiPart: boolean, partNum: number, basePattern: string|null }}
 */
function inspectMultiPart(filename) {
  const match = filename.match(/^(.*?)\.part(\d+)\.rar$/i);
  if (match) {
    return {
      isMultiPart: true,
      partNum: parseInt(match[2], 10),
      basePattern: match[1],
    };
  }
  return { isMultiPart: false, partNum: 0, basePattern: null };
}

/**
 * Busca ejecutables válidos de descompresión.
 * @returns {string|null} '7z' o 'unrar'
 */
function getExtractorTool() {
  if (fs.existsSync(SEVEN_ZIP)) return '7z';
  if (fs.existsSync(UNRAR_EXE)) return 'unrar';
  return null;
}

/**
 * Extrae un archivo comprimido a una carpeta destino.
 * @param {string} archivePath Ruta completa al archivo .rar o .zip
 * @param {string} outDir Directorio donde se extraerán los archivos
 * @param {string} [logFile]
 * @returns {{ success: boolean, extractedFiles: string[], error?: string }}
 */
function extractArchive(archivePath, outDir, logFile) {
  const tool = getExtractorTool();
  if (!tool) {
    const err = 'No se encontró ni 7-Zip ni UnRAR en el sistema.';
    logPs5(TAG, `❌ ${err}`, logFile);
    return { success: false, extractedFiles: [], error: err };
  }

  const multi = inspectMultiPart(path.basename(archivePath));
  if (multi.isMultiPart) {
    if (multi.partNum !== 1) {
      return { success: false, extractedFiles: [], error: 'Ignorando: no es el volumen part1.' };
    }
    // Verificación rápida: si part2 ni siquiera existe en disco, abortar sin llamar a 7z
    const dir = path.dirname(archivePath);
    const part2Name = path.basename(archivePath).replace(/\.part0*1\.rar$/i, '.part2.rar');
    if (!fs.existsSync(path.join(dir, part2Name))) {
      return { success: false, extractedFiles: [], error: 'Volúmenes incompletos (part2 ausente). Esperando descarga en IDM.' };
    }
    // Verificar si todos los volúmenes del juego ya están presentes en disco
    let volumesReady = false;
    for (const pwd of PASSWORDS) {
      const testProc = spawnSync(SEVEN_ZIP, ['t', archivePath, `-p${pwd}`, '-mmt=2', '-y', '-bso0', '-bse0', '-bsp0'], {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
        timeout: 20000,
      });
      if (testProc.status === 0) {
        volumesReady = true;
        break;
      }
    }
    if (!volumesReady) {
      return { success: false, extractedFiles: [], error: 'Volúmenes incompletos o corruptos. Esperando partes restantes.' };
    }
  }

  // Pre-verificación estricta de espacio en disco destino (suma todas las partes + 30 GB de reserva)
  try {
    let totalArchiveBytes = 0;
    const dir = path.dirname(archivePath);
    if (multi.isMultiPart && multi.basePattern) {
      for (const f of fs.readdirSync(dir)) {
        if (f.toLowerCase().startsWith(multi.basePattern.toLowerCase()) && f.toLowerCase().endsWith('.rar')) {
          try { totalArchiveBytes += fs.statSync(path.join(dir, f)).size; } catch {}
        }
      }
    } else {
      totalArchiveBytes = fs.statSync(archivePath).size;
    }

    const targetRoot = path.parse(path.resolve(outDir)).root;
    const s = fs.statfsSync(targetRoot);
    const freeBytes = s.bfree * s.bsize;
    const requiredBytes = (totalArchiveBytes * 1.05) + (30 * 1024 ** 3);
    if (freeBytes < requiredBytes) {
      const freeGb = (freeBytes / (1024 ** 3)).toFixed(1);
      const reqGb = (requiredBytes / (1024 ** 3)).toFixed(1);
      return { success: false, extractedFiles: [], error: `Espacio insuficiente en ${targetRoot} (${freeGb} GB libres < ${reqGb} GB requeridos con reserva de 30 GB).` };
    }
  } catch {}

  fs.mkdirSync(outDir, { recursive: true });

  const beforeFiles = new Set(fs.readdirSync(outDir));
  let extractedOk = false;
  let usedPassword = '';

  for (const pwd of PASSWORDS) {
    let proc;
    if (tool === '7z') {
      // 7z x "<archive>" -o"<outDir>" -p"<pwd>" -mmt=2 -y -bso0 -bse0 -bsp0 (<= 2 hilos, timeout 45m)
      proc = spawnSync(SEVEN_ZIP, ['x', archivePath, `-o${outDir}`, `-p${pwd}`, '-mmt=2', '-y', '-bso0', '-bse0', '-bsp0'], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: 45 * 60 * 1000,
      });
    } else {
      // unrar x -p<pwd> -y "<archive>" "<outDir>\"
      proc = spawnSync(UNRAR_EXE, ['x', `-p${pwd}`, '-y', archivePath, `${outDir}\\`], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: 45 * 60 * 1000,
      });
    }

    if (proc.status === 0) {
      extractedOk = true;
      usedPassword = pwd;
      break;
    }
  }

  if (!extractedOk) {
    const msg = `Fallo al descomprimir ${path.basename(archivePath)}. Contraseña incorrecta o volumen incompleto.`;
    logPs5(TAG, `⚠️ ${msg}`, logFile);
    return { success: false, extractedFiles: [], error: msg };
  }

  logPs5(TAG, `🔓 Descompresión exitosa de ${path.basename(archivePath)} (pwd: ${usedPassword})`, logFile);

  const afterFiles = fs.readdirSync(outDir);
  const newFiles = afterFiles.filter((f) => !beforeFiles.has(f)).map((f) => path.join(outDir, f));

  return { success: true, extractedFiles: newFiles };
}

/**
 * Elimina todos los volúmenes de un archivo multi-parte o un archivo único.
 * @param {string} archivePath
 * @param {string} [logFile]
 */
function cleanupArchiveVolumes(archivePath, logFile) {
  const dir = path.dirname(archivePath);
  const baseName = path.basename(archivePath);
  const multi = inspectMultiPart(baseName);

  if (multi.isMultiPart && multi.basePattern) {
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (file.toLowerCase().startsWith(multi.basePattern.toLowerCase()) && file.toLowerCase().endsWith('.rar')) {
          const p = path.join(dir, file);
          fs.unlinkSync(p);
          logPs5(TAG, `🧹 Volumen eliminado para liberar disco: ${file}`, logFile);
        }
      }
    } catch (e) {
      logPs5(TAG, `Error eliminando volúmenes multi-parte: ${e.message}`, logFile);
    }
  } else {
    try {
      if (fs.existsSync(archivePath)) {
        fs.unlinkSync(archivePath);
        logPs5(TAG, `🧹 Archivo eliminado para liberar disco: ${baseName}`, logFile);
      }
    } catch (e) {
      logPs5(TAG, `Error eliminando archivo: ${e.message}`, logFile);
    }
  }
}

module.exports = {
  extractArchive,
  cleanupArchiveVolumes,
  inspectMultiPart,
  getExtractorTool,
};
