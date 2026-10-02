/**
 * @file pkg_validator.js
 * @description Validador forense exhaustivo de paquetes PKG (PS4/PS5).
 *   Audita estructura binaria, contenedor Sony, límites de tabla, integridad
 *   param.sfo y legibilidad física para evitar que un PKG corrupto entre al pipeline.
 * SRP < 300L. Cero dependencias externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PKG_MAGIC = Buffer.from([0x7f, 0x43, 0x4e, 0x54]); // \x7fCNT
const SFO_MAGIC = Buffer.from([0x00, 0x50, 0x53, 0x46]); // \x00PSF
const TITLE_ID_RE = /^[A-Z]{4}\d{5}$/;

/**
 * Parsea el buffer binario de param.sfo.
 * @param {Buffer} buf
 * @returns {Record<string, any>}
 */
function parseSfoBuffer(buf) {
  if (!buf || buf.length < 20 || !buf.subarray(0, 4).equals(SFO_MAGIC)) return {};
  try {
    const keyTableStart = buf.readUInt32LE(8);
    const dataTableStart = buf.readUInt32LE(12);
    const numEntries = buf.readUInt32LE(16);
    const out = {};

    for (let i = 0; i < numEntries; i++) {
      const entryOff = 20 + i * 16;
      if (entryOff + 16 > buf.length) break;
      const keyOff = buf.readUInt16LE(entryOff);
      const paramFmt = buf.readUInt16LE(entryOff + 2);
      const paramLen = buf.readUInt32LE(entryOff + 4);
      const dataOff = buf.readUInt32LE(entryOff + 12);

      const kStart = keyTableStart + keyOff;
      let kEnd = kStart;
      while (kEnd < buf.length && buf[kEnd] !== 0) kEnd++;
      const key = buf.subarray(kStart, kEnd).toString('utf8');

      const dStart = dataTableStart + dataOff;
      const dEnd = dStart + paramLen;
      if (dEnd <= buf.length) {
        if (paramFmt === 0x0204 || paramFmt === 0x0004) {
          const valBytes = buf.subarray(dStart, dEnd);
          let nullIdx = valBytes.indexOf(0);
          out[key] = (nullIdx >= 0 ? valBytes.subarray(0, nullIdx) : valBytes).toString('utf8');
        } else if (paramFmt === 0x0404 && paramLen >= 4) {
          out[key] = buf.readUInt32LE(dStart);
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Valida exhaustivamente un archivo PKG.
 * @param {string} filePath
 * @returns {{ valid: boolean, errors: string[], warnings: string[], info: Record<string, any> }}
 */
function validatePkg(filePath) {
  const errors = [];
  const warnings = [];
  const info = {
    file: path.basename(filePath),
    path: filePath,
    sizeBytes: 0,
    headerSizeBytes: 0,
    titleId: 'UNKNOWN',
    title: 'UNKNOWN',
    category: 'UNKNOWN',
    appVer: '1.00',
    contentId: 'UNKNOWN',
    entriesCount: 0,
  };

  // CHECK 1: Existencia y tamaño mínimo
  let stat;
  try {
    stat = fs.statSync(filePath);
    info.sizeBytes = stat.size;
  } catch (err) {
    errors.push(`Error accediendo al archivo: ${err.message}`);
    return { valid: false, errors, warnings, info };
  }

  if (stat.size < 0x4000) {
    errors.push(`Archivo truncado o demasiado pequeño (${stat.size} bytes, mínimo 16 KB)`);
    return { valid: false, errors, warnings, info };
  }

  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
  } catch (err) {
    errors.push(`No se pudo abrir el archivo para lectura: ${err.message}`);
    return { valid: false, errors, warnings, info };
  }

  try {
    // CHECK 2: Cabecera Magic y Content ID
    const hdr = Buffer.alloc(0x1000);
    fs.readSync(fd, hdr, 0, 0x1000, 0);

    if (!hdr.subarray(0, 4).equals(PKG_MAGIC)) {
      errors.push(`Magic inválido (esperado \\x7fCNT, recibido ${hdr.subarray(0, 4).toString('hex')})`);
      return { valid: false, errors, warnings, info };
    }

    const cidRaw = hdr.subarray(0x40, 0x64);
    const cidNull = cidRaw.indexOf(0);
    info.contentId = (cidNull >= 0 ? cidRaw.subarray(0, cidNull) : cidRaw).toString('utf8');

    // CHECK 3: Integridad de tamaño del contenedor (Anti-Truncamiento)
    const headerSize = hdr.readBigUInt64BE(0x418);
    info.headerSizeBytes = Number(headerSize);

    if (BigInt(stat.size) < headerSize) {
      const missingGb = ((Number(headerSize) - stat.size) / (1024 ** 3)).toFixed(2);
      const totalGb = (Number(headerSize) / (1024 ** 3)).toFixed(2);
      errors.push(`PKG INCOMPLETO/TRUNCADO: faltan ${missingGb} GB de ${totalGb} GB requeridos.`);
    }

    const extraBytes = stat.size - Number(headerSize);
    if (extraBytes > 32 * 1024 * 1024) {
      warnings.push(`Exceso de bytes al final del archivo: +${(extraBytes / (1024 ** 2)).toFixed(1)} MB`);
    }

    // CHECK 4: Límites de Cuerpo / Body
    const bodyOff = hdr.readBigUInt64BE(0x420);
    const bodySize = hdr.readBigUInt64BE(0x428);
    if (bodyOff + bodySize > BigInt(stat.size)) {
      errors.push('El cuerpo del PKG (body) excede los límites físicos del archivo.');
    }

    // CHECK 5: Tabla de Entradas y offsets
    const entryCount = hdr.readUInt32BE(0x10);
    const tableOffset = hdr.readUInt32BE(0x18);
    info.entriesCount = entryCount;

    if (entryCount === 0 || entryCount > 256) {
      errors.push(`Cantidad anómala de entradas en tabla: ${entryCount}`);
    }

    const tableBytesNeeded = entryCount * 32;
    if (tableOffset + tableBytesNeeded > stat.size) {
      errors.push(`Tabla de entradas fuera de límites: offset 0x${tableOffset.toString(16)}`);
    }

    const tableBuf = Buffer.alloc(tableBytesNeeded);
    fs.readSync(fd, tableBuf, 0, tableBytesNeeded, tableOffset);

    let sfoOffset = 0;
    let sfoSize = 0;

    for (let i = 0; i < entryCount; i++) {
      const off = i * 32;
      const eid = tableBuf.readUInt32BE(off);
      const entOffset = tableBuf.readUInt32BE(off + 16);
      const entSize = tableBuf.readUInt32BE(off + 20);

      if (entOffset + entSize > stat.size) {
        errors.push(`Entrada 0x${eid.toString(16)} fuera de archivo (offset ${entOffset} + size ${entSize} > ${stat.size})`);
      }
      if (eid === 0x1000) {
        sfoOffset = entOffset;
        sfoSize = entSize;
      }
    }

    // CHECK 6: Metadatos param.sfo obligatorios
    if (sfoOffset === 0 || sfoSize === 0) {
      errors.push('No se encontró la entrada de metadatos param.sfo (0x1000).');
    } else {
      const sfoBuf = Buffer.alloc(sfoSize);
      fs.readSync(fd, sfoBuf, 0, sfoSize, sfoOffset);
      const sfo = parseSfoBuffer(sfoBuf);

      info.title = sfo.TITLE || sfo.TITLE_00 || 'Sin Título';
      info.titleId = (sfo.TITLE_ID || '').toUpperCase();
      info.appVer = sfo.APP_VER || sfo.VERSION || '1.00';
      const cat = sfo.CATEGORY || 'UNKNOWN';
      info.category = cat === 'gd' ? 'BASE' : (cat === 'gp' ? 'UPDATE' : (cat === 'ac' ? 'DLC' : cat));

      if (!TITLE_ID_RE.test(info.titleId)) {
        errors.push(`Title ID inválido o ausente en param.sfo: "${info.titleId}"`);
      }
      if (!['BASE', 'UPDATE', 'DLC'].includes(info.category)) {
        warnings.push(`Categoría no estándar: ${info.category} (${cat})`);
      }
    }

    // CHECK 7: Verificación física de sectores (Lectura inicio, medio y final)
    const testBuf = Buffer.alloc(65536);
    // Inicio
    const r1 = fs.readSync(fd, testBuf, 0, 65536, 0);
    if (r1 !== 65536) errors.push('Fallo de lectura de sector al inicio del archivo.');
    // Medio
    const midPoint = Math.floor(stat.size / 2);
    const r2 = fs.readSync(fd, testBuf, 0, 65536, midPoint);
    if (r2 !== 65536) errors.push('Fallo de lectura de sector en el punto medio del archivo.');
    // Final
    const endPoint = stat.size - 65536;
    const r3 = fs.readSync(fd, testBuf, 0, 65536, endPoint);
    if (r3 !== 65536) errors.push('Fallo de lectura de sector al final del archivo.');

  } catch (err) {
    errors.push(`Excepción durante el análisis binario: ${err.message}`);
  } finally {
    try {
      fs.closeSync(fd);
    } catch {}
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    info,
  };
}

module.exports = {
  validatePkg,
  parseSfoBuffer,
  PKG_MAGIC,
  SFO_MAGIC,
};
