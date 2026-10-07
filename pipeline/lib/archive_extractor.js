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
const { isPathInside } = require('./security.js');

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
 * Lista recursiva de archivos (rutas relativas) bajo un directorio.
 * @param {string} dir
 * @returns {string[]}
 */
function listFilesRecursive(dir) {
  const out = [];
  const walk = (cur, rel) => {
    let entries = [];
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const relP = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(cur, e.name), relP);
      else out.push(relP);
    }
  };
  walk(dir, '');
  return out;
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
 * Nombre de volumen con el mismo ancho de padding que el part1
 * (part01 → part02, part001 → part002, part1 → part2).
 * @param {string} basePattern
 * @param {number} num
 * @param {number} width
 * @returns {string}
 */
function formatPartName(basePattern, num, width) {
  return `${basePattern}.part${String(num).padStart(width, '0')}.rar`;
}

/**
 * Extrae un archivo comprimido a una carpeta destino.
 * Estados: success=true (listo) | success=false + retryable=true (esperar
 * partes, NO mandar a .failed) | success=false sin retryable (permanente).
 * @param {string} archivePath Ruta completa al archivo .rar o .zip
 * @param {string} outDir Directorio donde se extraerán los archivos
 * @param {string} [logFile]
 * @returns {{ success: boolean, retryable?: boolean, extractedFiles: string[], error?: string }}
 */
function extractArchive(archivePath, outDir, logFile) {
  const tool = getExtractorTool();
  if (!tool) {
    const err = 'No se encontró ni 7-Zip ni UnRAR en el sistema.';
    logPs5(TAG, `❌ ${err}`, logFile);
    return { success: false, extractedFiles: [], error: err };
  }

  const multi = inspectMultiPart(path.basename(archivePath));
  let targetArchive = archivePath;
  if (multi.isMultiPart) {
    const dir = path.dirname(archivePath);
    // Ancho del padding tomado del propio nombre (part01 → 2, part1 → 1).
    const widthMatch = path.basename(archivePath).match(/\.part(0*\d+)\.rar$/i);
    const width = widthMatch ? widthMatch[1].length : 1;
    // Acepta cualquier ancho ya descargado para el volumen 1.
    let part1Path = null;
    try {
      for (const f of fs.readdirSync(dir)) {
        const m = f.match(/\.part(0*)1\.rar$/i);
        if (m && f.slice(0, -m[0].length).toLowerCase() === multi.basePattern.toLowerCase()) {
          part1Path = path.join(dir, f);
          break;
        }
      }
    } catch {}
    if (!part1Path) {
      return { success: false, retryable: true, extractedFiles: [], error: 'Ignorando: no es el volumen part1 (part1 ausente, esperando partes).' };
    }
    targetArchive = part1Path;

    // Inventario de volúmenes presentes y verificación de contigüidad 1..max.
    let present = new Set();
    try {
      for (const f of fs.readdirSync(dir)) {
        const m = f.match(/\.part(0*)(\d+)\.rar$/i);
        if (m && f.slice(0, -m[0].length).toLowerCase() === multi.basePattern.toLowerCase()) {
          present.add(parseInt(m[2], 10));
        }
      }
    } catch {}
    const maxVol = present.size ? Math.max(...present) : 1;
    for (let n = 1; n <= maxVol; n++) {
      if (!present.has(n)) {
        const missing = formatPartName(multi.basePattern, n, width);
        return { success: false, retryable: true, extractedFiles: [], error: `Volúmenes incompletos: part${n} ausente — ${missing} (esperando partes restantes).` };
      }
    }
    if (maxVol < 2) {
      const missing = formatPartName(multi.basePattern, 2, width);
      return { success: false, retryable: true, extractedFiles: [], error: `Volúmenes incompletos: part2 ausente — ${missing} (esperando partes restantes).` };
    }

    if (tool === '7z') {
      const listProc = spawnSync(SEVEN_ZIP, ['l', targetArchive, '-slt'], {
        encoding: 'utf8',
        maxBuffer: 2 * 1024 * 1024,
        timeout: 5000,
      });
      if (listProc.status !== 0 || (listProc.stdout && listProc.stdout.includes('Missing volume'))) {
        return { success: false, retryable: true, extractedFiles: [], error: 'Volúmenes incompletos: faltan partes restantes (esperando descarga).' };
      }
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

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const beforeFiles = new Set(listFilesRecursive(outDir));
  let extractedOk = false;
  let usedPassword = '';

  for (const pwd of PASSWORDS) {
    let proc;
    if (tool === '7z') {
      // 7z x "<archive>" -o"<outDir>" -p"<pwd>" -mmt=2 -y -bso0 -bse0 -bsp0 (<= 2 hilos, timeout 45m)
      proc = spawnSync(SEVEN_ZIP, ['x', targetArchive, `-o${outDir}`, `-p${pwd}`, '-mmt=2', '-y', '-bso0', '-bse0', '-bsp0'], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        timeout: 45 * 60 * 1000,
      });
    } else {
      // unrar x -p<pwd> -y "<archive>" "<outDir>\"
      proc = spawnSync(UNRAR_EXE, ['x', `-p${pwd}`, '-y', targetArchive, `${outDir}\\`], {
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

  const afterFiles = listFilesRecursive(outDir);
  const newFiles = [];
  for (const rel of afterFiles) {
    if (beforeFiles.has(rel)) continue;
    const fullPath = path.join(outDir, rel);
    // realpath: si el extraído es (o cuelga de) un symlink/junction que
    // apunta fuera, se detecta aunque path.resolve no lo vea.
    let effective = fullPath;
    try { effective = fs.realpathSync(fullPath); } catch {}
    let outReal = outDir;
    try { outReal = fs.realpathSync(outDir); } catch {}
    if (!isPathInside(outReal, effective)) {
      const escapeErr = `ALERTA DE SEGURIDAD (Zip Slip): archivo fuera de outDir: ${rel}`;
      logPs5(TAG, `🚨 ${escapeErr}`, logFile);
      try { fs.unlinkSync(fullPath); } catch {}
      return { success: false, extractedFiles: [], error: escapeErr };
    }
    newFiles.push(fullPath);
  }

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
