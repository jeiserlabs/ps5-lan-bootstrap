/**
 * @file archive_extractor.test.js
 * @description Pruebas unitarias para archive_extractor.js (detección multi-parte,
 *   herramienta 7z y fail-fast de integridad de volúmenes).
 * SRP < 300L. Cero dependencias externas (node:test + node:assert/strict).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const {
  inspectMultiPart,
  getExtractorTool,
  extractArchive,
} = require('../lib/archive_extractor.js');

test('inspectMultiPart — Detección precisa de archivos multi-volumen', () => {
  const p1 = inspectMultiPart('Game_Title.part1.rar');
  assert.equal(p1.isMultiPart, true);
  assert.equal(p1.partNum, 1);
  assert.equal(p1.basePattern, 'Game_Title');

  const p04 = inspectMultiPart('Game_Title.part04.rar');
  assert.equal(p04.isMultiPart, true);
  assert.equal(p04.partNum, 4);
  assert.equal(p04.basePattern, 'Game_Title');

  const single = inspectMultiPart('Solo_Juego.rar');
  assert.equal(single.isMultiPart, false);
  assert.equal(single.partNum, 0);
  assert.equal(single.basePattern, null);

  const pkg = inspectMultiPart('CUSA12345.pkg');
  assert.equal(pkg.isMultiPart, false);
});

test('getExtractorTool — Localiza 7-Zip o UnRAR en el sistema', () => {
  const tool = getExtractorTool();
  assert.ok(tool === '7z' || tool === 'unrar' || tool === null);
  // En entorno Windows con 7-Zip estándar instalado debe detectar '7z'
  if (fs.existsSync('C:\\Program Files\\7-Zip\\7z.exe')) {
    assert.equal(tool, '7z');
  }
});

test('extractArchive — Fail-fast si no es volumen part1', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch_test_'));
  try {
    const fakePart2 = path.join(tmpDir, 'test_game.part2.rar');
    fs.writeFileSync(fakePart2, 'dummy');
    const res = extractArchive(fakePart2, tmpDir);
    assert.equal(res.success, false);
    assert.match(res.error, /no es el volumen part1/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('extractArchive — Fail-fast si part2 está ausente en disco', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'arch_test_'));
  try {
    const fakePart1 = path.join(tmpDir, 'test_game.part1.rar');
    fs.writeFileSync(fakePart1, 'dummy');
    const res = extractArchive(fakePart1, tmpDir);
    assert.equal(res.success, false);
    assert.match(res.error, /part2 ausente/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
