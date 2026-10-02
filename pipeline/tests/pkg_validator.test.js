/**
 * @file pkg_validator.test.js
 * @description Pruebas unitarias para el validador forense de PKGs.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { validatePkg, parseSfoBuffer, PKG_MAGIC, SFO_MAGIC } = require('../lib/pkg_validator.js');

test('pkg_validator: rechaza archivos inexistentes', () => {
  const res = validatePkg('C:/no_existe_archivo_invalido.pkg');
  assert.equal(res.valid, false);
  assert.ok(res.errors[0].includes('Error accediendo'));
});

test('pkg_validator: rechaza archivos menores a 16 KB', () => {
  const tmp = path.join(os.tmpdir(), 'tiny.pkg');
  fs.writeFileSync(tmp, Buffer.alloc(100));
  try {
    const res = validatePkg(tmp);
    assert.equal(res.valid, false);
    assert.ok(res.errors[0].includes('truncado o demasiado pequeño'));
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('pkg_validator: rechaza archivos sin magic \\x7fCNT', () => {
  const tmp = path.join(os.tmpdir(), 'bad_magic.pkg');
  fs.writeFileSync(tmp, Buffer.alloc(0x5000, 0x41));
  try {
    const res = validatePkg(tmp);
    assert.equal(res.valid, false);
    assert.ok(res.errors[0].includes('Magic inválido'));
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('pkg_validator: parseSfoBuffer extrae valores correctamente', () => {
  // Construir buffer SFO sintético mínimo
  const sfo = Buffer.alloc(128);
  sfo.set(SFO_MAGIC, 0);
  sfo.writeUInt32LE(0x00000101, 4); // version
  sfo.writeUInt32LE(40, 8); // key table start
  sfo.writeUInt32LE(60, 12); // data table start
  sfo.writeUInt32LE(1, 16); // 1 entry

  // Entry 0: key offset 0, fmt 0x0204 (string utf8), len 9, max 16, data off 0
  sfo.writeUInt16LE(0, 20);
  sfo.writeUInt16LE(0x0204, 22);
  sfo.writeUInt32LE(9, 24);
  sfo.writeUInt32LE(16, 28);
  sfo.writeUInt32LE(0, 32);

  // Key: "TITLE_ID\0"
  sfo.write('TITLE_ID\0', 40, 'utf8');
  // Data: "CUSA12345\0"
  sfo.write('CUSA12345\0', 60, 'utf8');

  const parsed = parseSfoBuffer(sfo);
  assert.equal(parsed.TITLE_ID, 'CUSA12345');
});
