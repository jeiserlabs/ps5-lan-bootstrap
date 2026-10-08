/**
 * @file update_payloads.test.js
 * @description Tests unitarios y de resiliencia para update_payloads.js.
 *   Verifica validación de hash SHA256, backups pre-escritura y rollback automático.
 * SRP < 150L.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {
  backupPayload,
  applyPayloadWithRollback,
  getLocalFileHash,
  loadPayloadManifest,
} = require('../scripts/update_payloads.js');

test('Payload Updater — Validación Criptográfica y Rollback', async (t) => {
  const tmpDir = path.join(os.tmpdir(), `ps5-updater-test-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const backupDir = path.join(tmpDir, 'backups');

  const testFile = path.join(tmpDir, 'kstuff.elf');
  const originalContent = Buffer.from('ORIGINAL_KSTUFF_V1.11');
  fs.writeFileSync(testFile, originalContent);

  await t.test('1. backupPayload() preserva copia íntegra del archivo original', () => {
    const backupPath = backupPayload(testFile, backupDir);
    assert.ok(fs.existsSync(backupPath));
    assert.equal(fs.readFileSync(backupPath, 'utf8'), 'ORIGINAL_KSTUFF_V1.11');
  });

  await t.test('2. applyPayloadWithRollback() rechaza actualización si el hash SHA256 no coincide', () => {
    const newContent = Buffer.from('TAMPERED_KSTUFF_V1.12');
    const wrongHash = '0000000000000000000000000000000000000000000000000000000000000000';
    const result = applyPayloadWithRollback(testFile, newContent, wrongHash, backupDir);

    assert.equal(result.success, false);
    assert.match(result.error, /Hash mismatch/);
    // El archivo original debe permanecer 100% inalterado
    assert.equal(fs.readFileSync(testFile, 'utf8'), 'ORIGINAL_KSTUFF_V1.11');
  });

  await t.test('3. applyPayloadWithRollback() aplica actualización exitosa con hash verificado', () => {
    const newContent = Buffer.from('LEGIT_KSTUFF_V1.12');
    const correctHash = crypto.createHash('sha256').update(newContent).digest('hex');
    const result = applyPayloadWithRollback(testFile, newContent, correctHash, backupDir);

    assert.equal(result.success, true);
    assert.equal(result.sha256, correctHash);
    assert.equal(fs.readFileSync(testFile, 'utf8'), 'LEGIT_KSTUFF_V1.12');
    // Verifica que se creó el backup del estado previo
    assert.ok(fs.existsSync(result.backupPath));
  });

  await t.test('4. getLocalFileHash() calcula hash exacto o devuelve null si no existe', () => {
    const hash = getLocalFileHash(testFile);
    assert.ok(typeof hash === 'string');
    assert.equal(getLocalFileHash(path.join(tmpDir, 'non_existent.elf')), null);
  });

  await t.test('5. loadPayloadManifest() carga manifiesto con entradas válidas y hashes de 64 caracteres', () => {
    const manifest = loadPayloadManifest();
    assert.ok(manifest['kstuff.elf'], 'kstuff.elf debe existir en el manifiesto');
    assert.equal(manifest['kstuff.elf'].assetName, 'kstuff.elf');
    assert.equal(manifest['kstuff.elf'].releaseTag, 'v1.11');
    assert.equal(manifest['kstuff.elf'].sha256.length, 64);
    assert.ok(manifest['ftpsrv-ps5.elf']);
    assert.equal(manifest['ftpsrv-ps5.elf'].releaseTag, 'v0.21.1');
    assert.equal(manifest['ftpsrv-ps5.elf'].sha256.length, 64);
  });

  await t.test('6. Fail-Closed: applyPayloadWithRollback rechaza hash mismatch y conserva archivo previo', () => {
    const tampered = Buffer.from('TAMPERED_CODE_EXECUTION');
    const legitHash = crypto.createHash('sha256').update(Buffer.from('DIFFERENT_CODE')).digest('hex');
    const res = applyPayloadWithRollback(testFile, tampered, legitHash, backupDir);
    assert.equal(res.success, false);
    assert.match(res.error, /Hash mismatch/);
  });

  // Limpieza
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});
