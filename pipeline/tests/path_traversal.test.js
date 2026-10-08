/**
 * @file path_traversal.test.js
 * @description Test de seguridad para verificar mitigación estricta de Path Traversal
 *   en todos los módulos de red y filesystem del pipeline.
 * SRP < 150L.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { sanitizeFilename, isPathInside, isRealPathInside } = require('../lib/security.js');

test('Seguridad — Sanitización Estricta Anti-Path Traversal', async (t) => {
  await t.test('1. Neutraliza secuencias relativas estilo UNIX (../../etc/passwd)', () => {
    const malicious = '../../etc/passwd';
    const sanitized = sanitizeFilename(malicious);
    assert.equal(sanitized, 'passwd');
    assert.ok(!sanitized.includes('..'));
    assert.ok(!sanitized.includes('/'));
  });

  await t.test('2. Neutraliza secuencias relativas estilo Windows (..\\..\\Windows\\cmd.exe)', () => {
    const malicious = '..\\..\\Windows\\System32\\cmd.exe';
    const sanitized = sanitizeFilename(malicious);
    assert.equal(sanitized, 'cmd.exe');
    assert.ok(!sanitized.includes('..'));
    assert.ok(!sanitized.includes('\\'));
  });

  await t.test('3. Neutraliza secuencias codificadas en URL (%2e%2e%2fmalicious.pkg)', () => {
    const malicious = '%2e%2e%2f%2e%2e%2fevil.pkg';
    const sanitized = sanitizeFilename(malicious);
    assert.equal(sanitized, 'evil.pkg');
  });

  await t.test('4. Preserva nombres legítimos de paquetes de PlayStation', () => {
    const legit = 'CUSA11518_v01.00_[11.00]-Cyber.pkg';
    const sanitized = sanitizeFilename(legit);
    assert.equal(sanitized, legit);
  });

  await t.test('5. Elimina caracteres de control y metacaracteres de inyección shell', () => {
    const malicious = 'game; inject-cmd;.pkg';
    const sanitized = sanitizeFilename(malicious);
    assert.ok(!sanitized.includes(';'));
    assert.equal(sanitized, 'game inject-cmd.pkg');
  });

  await t.test('6. isRealPathInside valida rutas reales y rechaza escapes fuera del directorio', () => {
    const parent = path.resolve('.');
    const validChild = path.resolve('./pipeline/lib/security.js');
    assert.ok(isRealPathInside(parent, validChild));
    const outside = path.resolve('..');
    assert.ok(!isRealPathInside(parent, outside));
  });
});
