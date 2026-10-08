/**
 * @file installed_store.test.js
 * @description Pruebas de robustez para almacenamiento atómico y recuperación de installed_pkgs.json.
 * SRP < 100L.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { loadInstalledList, saveInstalledList, recordInstalled } = require('../lib/installed_store.js');

test('Installed Store — Persistencia Atómica y Resiliencia', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `ps5_store_test_${Date.now()}`);
  const storeFile = path.join(tmpDir, 'installed_pkgs.json');
  fs.mkdirSync(tmpDir, { recursive: true });

  t.after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });

  await t.test('1. loadInstalledList devuelve arreglo vacío si el archivo no existe', () => {
    const list = loadInstalledList(storeFile);
    assert.deepEqual(list, []);
  });

  await t.test('2. saveInstalledList persiste datos atómicamente', () => {
    const ok = saveInstalledList(storeFile, ['game1.pkg', 'game2.pkg']);
    assert.ok(ok);
    const loaded = loadInstalledList(storeFile);
    assert.deepEqual(loaded, ['game1.pkg', 'game2.pkg']);
  });

  await t.test('3. saveInstalledList crea copia .bak antes de sobrescribir', () => {
    const ok = saveInstalledList(storeFile, ['game1.pkg', 'game2.pkg', 'game3.pkg']);
    assert.ok(ok);
    assert.ok(fs.existsSync(`${storeFile}.bak`));
    const bakContent = JSON.parse(fs.readFileSync(`${storeFile}.bak`, 'utf8'));
    assert.deepEqual(bakContent, ['game1.pkg', 'game2.pkg']);
  });

  await t.test('4. recordInstalled agrega elementos sin duplicados', () => {
    recordInstalled(storeFile, 'game4.pkg');
    let loaded = loadInstalledList(storeFile);
    assert.ok(loaded.includes('game4.pkg'));

    // Reintento no genera duplicados
    recordInstalled(storeFile, 'game4.pkg');
    loaded = loadInstalledList(storeFile);
    assert.equal(loaded.filter((x) => x === 'game4.pkg').length, 1);
  });

  await t.test('5. Recupera desde .bak si el archivo principal está corrupto', () => {
    // Corromper el archivo principal intencionalmente
    fs.writeFileSync(storeFile, '{ corrupted json : [', 'utf8');
    const recovered = loadInstalledList(storeFile);
    assert.ok(Array.isArray(recovered));
    assert.ok(recovered.length > 0);
  });
});
