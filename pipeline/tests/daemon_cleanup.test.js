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

test('daemon — ciclo con guarda de reentrancia (setInterval no solapa ciclos)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'daemon.js'), 'utf8');
  // Sin esta guarda, setInterval lanza un cycle() nuevo cada 30s aunque el
  // anterior dure ~180s: quedan ~6 solapados y cada uno vuelve a disparar
  // /install contra el receiver de la PS5 (tarea única), que reinicia el pull
  // desde byte 0. El techo pasa a ser ~30s x 1 Gbps = 3.36 GB de los 90.6 GB
  // requeridos, así que la instalación nunca termina ni se escribe en el SSOT.
  assert.match(src, /cicloEnVuelo/);
  assert.match(src, /if \(cicloEnVuelo\) return;\s*cicloEnVuelo = true;\s*cycle\(\)/);
  assert.match(src, /\.finally\(\(\) => \{ cicloEnVuelo = false; \}\);/);
});

test('daemon — isStillWriting(): no instalar un PKG que se está descargando', () => {
  const dir = mkTmp();
  try {
    const fresh = path.join(dir, 'Descargando.pkg');
    fs.writeFileSync(fresh, 'x');
    // Recién escrito (IDM/aria2 siguen bajando): mtime al día → no se instala.
    assert.equal(daemon.isStillWriting(fresh), true);

    const stable = path.join(dir, 'Listo.pkg');
    fs.writeFileSync(stable, 'x');
    const old = Date.now() - 10 * 60 * 1000;
    fs.utimesSync(stable, old / 1000, old / 1000);
    assert.equal(daemon.isStillWriting(stable), false);

    // Sin stat no hay certeza: esperar al próximo ciclo, nunca asumir listo.
    assert.equal(daemon.isStillWriting(path.join(dir, 'no-existe.pkg')), true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('daemon — installPass filtra los PKG en escritura antes de disparar /install', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'daemon.js'), 'utf8');
  assert.match(src, /isStillWriting\(p\)/);
  assert.match(src, /const pkgToInstall = plan\.plan\.find\(\(p\) => !isStillWriting\(p\)\)/);
  assert.match(src, /Aún escribiéndose/);
  // El camino viejo (siempre plan[0]) instalaba archivos a medio bajar.
  assert.doesNotMatch(src, /const pkgToInstall = plan\.plan\[0\];/);
});

test('daemon — watchDirs: vigila la carpeta de descargas de Telegram (no solo el Desktop)', () => {
  // Telegram Desktop escribe directo en su carpeta de destino. Si esa carpeta
  // no está vigilada, los .pkg/.rar terminados se quedan ahí para siempre y el
  // pipeline nunca los instala (hueco detectado el 2026-10-07 con la descarga
  // de 44.6 GB por Telegram).
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'daemon.js'), 'utf8');
  assert.match(src, /function watchDirs\(\)/);
  assert.match(src, /for \(const dir of watchDirs\(\)\)/);
  assert.doesNotMatch(src, /for \(const file of fs\.readdirSync\(cfg\.paths\.watchDir\)\)/);
  const { getPs5Config } = require('../lib/config.js');
  const cfg = getPs5Config();
  assert.ok(Array.isArray(cfg.paths.watchDirs));
  const telegramDir = path.join('C:', 'Users', 'dev', 'Desktop', 'DESCARGAS TELEGRAM');
  assert.ok(cfg.paths.watchDirs.includes(telegramDir), `watchDirs=${JSON.stringify(cfg.paths.watchDirs)}`);
});

test('daemon — isSizeStable(): Telegram escribe a ráfagas, el mtime solo no basta', () => {
  const dir = mkTmp();
  try {
    const p = path.join(dir, 'GOW_v1.35.patch.part1.rar');
    fs.writeFileSync(p, Buffer.alloc(1000));
    const t0 = 5_000_000;
    // Primera observación: se aprende el tamaño, nunca se asume listo.
    assert.equal(daemon.isSizeStable(p, t0, 90000), false);
    assert.equal(daemon.isSizeStable(p, t0 + 10_000, 90000), false, 'aún dentro de la ventana');
    assert.equal(daemon.isSizeStable(p, t0 + 100_000, 90000), true, 'sin cambios 100s → estable');
    // Una ráfaga nueva reinicia la ventana (no se procesa a mitad de descarga).
    fs.appendFileSync(p, Buffer.alloc(5));
    assert.equal(daemon.isSizeStable(p, t0 + 110_000, 90000), false);
    assert.equal(daemon.isSizeStable(p, t0 + 210_000, 90000), true);
    // Archivo inexistente: sin certeza → nunca listo.
    assert.equal(daemon.isSizeStable(path.join(dir, 'no-existe.rar'), t0 + 300_000, 90000), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('daemon — descargas incompletas de Telegram NO se renombran a .failed', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'daemon.js'), 'utf8');
  // El rename a .failed solo aplica al watchDir clásico; en carpetas de descarga
  // activas (Telegram) un set multipart incompleto da el mismo error que uno
  // corrupto y renombrarlo rompe la descarga en curso.
  assert.match(src, /if \(dir === cfg\.paths\.watchDir\) \{[\s\S]{0,200}\.failed/);
  assert.match(src, /REPORTED_FAILURES/);
  assert.match(src, /se deja intacta, puede faltar descarga/);
  // Guarda de tamaño enganchada en AMBAS pasadas (archivos y PKGs sueltos).
  assert.match(src, /if \(!isSizeStable\(fullPath\)\) continue;/);
  assert.equal((src.match(/if \(!isSizeStable\(fullPath\)\) continue;/g) || []).length, 2);
  // Y un PKG truncado no se mueve a la biblioteca (protege descargas a medias).
  assert.match(src, /const audit = validatePkg\(fullPath\);/);
  assert.match(src, /PKG incompleto, no se mueve a biblioteca/);
});
