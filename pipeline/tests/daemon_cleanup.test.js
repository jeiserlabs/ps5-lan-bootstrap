/**
 * @file daemon_cleanup.test.js
 * @description Cierra el P1 de reauditoría f2e71b4: el daemon solo borraba el
 *   volumen disparador (`fs.unlinkSync(fullPath)`) y dejaba part02/part03
 *   huérfanos → el siguiente ciclo entraba en retryable esperando un part01
 *   ya eliminado. Verifica (1) matcher exacto del cleanup, (2) que el camino
 *   de producción del daemon usa cleanupArchiveVolumes vía handleArchiveSuccess.
 * SRP < 300L. Cero dependencias externas (node:test + node:assert/strict).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  extractArchive,
  cleanupArchiveVolumes,
  isSameMultipartVolume,
} = require('../lib/archive_extractor.js');
const daemon = require('../scripts/daemon.js');

function mkTmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'daemon_cleanup_'));
}

test('isSameMultipartVolume — matcher exacto .part<numero>.rar', () => {
  assert.equal(isSameMultipartVolume('Game.part01.rar', 'Game'), true);
  assert.equal(isSameMultipartVolume('Game.part02.rar', 'Game'), true);
  assert.equal(isSameMultipartVolume('Game.PART03.RAR', 'Game'), true);
  assert.equal(isSameMultipartVolume('Game.part1.rar', 'Game'), true);
  // Trampa del P1 asociado: empieza por la base y termina en .rar, pero NO es volumen.
  assert.equal(isSameMultipartVolume('Game_bonus.rar', 'Game'), false);
  assert.equal(isSameMultipartVolume('Game_notes.rar', 'Game'), false);
  assert.equal(isSameMultipartVolume('Game.rar', 'Game'), false);
  assert.equal(isSameMultipartVolume('Other.part01.rar', 'Game'), false);
});

test('cleanupArchiveVolumes — borra todo el conjunto y preserva lookalikes', () => {
  const dir = mkTmp();
  try {
    for (const f of ['Game.part01.rar', 'Game.part02.rar', 'Game.part03.rar']) {
      fs.writeFileSync(path.join(dir, f), 'dummy');
    }
    fs.writeFileSync(path.join(dir, 'Game_bonus.rar'), 'no tocar');
    fs.writeFileSync(path.join(dir, 'Game_notes.rar'), 'no tocar');

    cleanupArchiveVolumes(path.join(dir, 'Game.part01.rar'));

    assert.equal(fs.existsSync(path.join(dir, 'Game.part01.rar')), false);
    assert.equal(fs.existsSync(path.join(dir, 'Game.part02.rar')), false);
    assert.equal(fs.existsSync(path.join(dir, 'Game.part03.rar')), false);
    assert.equal(fs.existsSync(path.join(dir, 'Game_bonus.rar')), true);
    assert.equal(fs.existsSync(path.join(dir, 'Game_notes.rar')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cleanupArchiveVolumes — disparado desde part02 también limpia todo (orden-independiente)', () => {
  const dir = mkTmp();
  try {
    for (const f of ['Game.part01.rar', 'Game.part02.rar', 'Game.part03.rar']) {
      fs.writeFileSync(path.join(dir, f), 'dummy');
    }
    cleanupArchiveVolumes(path.join(dir, 'Game.part02.rar'));
    const leftovers = fs.readdirSync(dir).filter((f) => /\.part\d+\.rar$/i.test(f));
    assert.deepEqual(leftovers, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('daemon — handleArchiveSuccess() es el camino de producción y limpia huérfanos', () => {
  const dir = mkTmp();
  try {
    for (const f of ['Game.part01.rar', 'Game.part02.rar', 'Game.part03.rar']) {
      fs.writeFileSync(path.join(dir, f), 'dummy');
    }
    fs.writeFileSync(path.join(dir, 'Game_bonus.rar'), 'no tocar');

    assert.equal(typeof daemon.handleArchiveSuccess, 'function');
    daemon.handleArchiveSuccess(path.join(dir, 'Game.part01.rar'));

    // Sin huérfanos: ningún .part<N>.rar sobrevive al éxito.
    const leftovers = fs.readdirSync(dir).filter((f) => /\.part\d+\.rar$/i.test(f));
    assert.deepEqual(leftovers, []);
    assert.equal(fs.existsSync(path.join(dir, 'Game_bonus.rar')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cleanupArchiveVolumes — reporta {ok,deleted,failed} en éxito multipart', () => {
  const dir = mkTmp();
  try {
    for (const f of ['Game.part01.rar', 'Game.part02.rar']) {
      fs.writeFileSync(path.join(dir, f), 'dummy');
    }
    const res = cleanupArchiveVolumes(path.join(dir, 'Game.part01.rar'));
    assert.equal(res.ok, true);
    assert.deepEqual([...res.deleted].sort(), ['Game.part01.rar', 'Game.part02.rar']);
    assert.deepEqual(res.failed, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cleanupArchiveVolumes — archivo único reporta deleted con su nombre', () => {
  const dir = mkTmp();
  try {
    fs.writeFileSync(path.join(dir, 'Solo.rar'), 'dummy');
    const res = cleanupArchiveVolumes(path.join(dir, 'Solo.rar'));
    assert.equal(res.ok, true);
    assert.deepEqual(res.deleted, ['Solo.rar']);
    assert.deepEqual(res.failed, []);
    assert.equal(fs.existsSync(path.join(dir, 'Solo.rar')), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('daemon — handleArchiveSuccess() retorna el reporte (no declara éxito a ciegas)', () => {
  const dir = mkTmp();
  try {
    for (const f of ['Game.part01.rar', 'Game.part02.rar', 'Game.part03.rar']) {
      fs.writeFileSync(path.join(dir, f), 'dummy');
    }
    const res = daemon.handleArchiveSuccess(path.join(dir, 'Game.part01.rar'));
    assert.equal(res.ok, true);
    assert.deepEqual(res.failed, []);
    const leftovers = fs.readdirSync(dir).filter((f) => /\.part\d+\.rar$/i.test(f));
    assert.deepEqual(leftovers, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('daemon — processPendingArchives delega el borrado post-éxito al cleanup (no unlink suelto)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'daemon.js'), 'utf8');
  assert.match(src, /cleanupArchiveVolumes/);
  assert.match(src, /handleArchiveSuccess\(fullPath\)/);
  // El mensaje legacy del borrado parcial ya no existe; el éxito reporta volúmenes (plural).
  assert.match(src, /volúmenes eliminados/);
  assert.doesNotMatch(src, /comprimido eliminado/);
  // P2: el cleanup parcial no se reporta como éxito total.
  assert.match(src, /failed\.length/);
  assert.match(src, /quedaron volúmenes/);
});
