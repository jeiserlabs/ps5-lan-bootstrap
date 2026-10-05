const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyPkg, getTitleId, planInstallOrder } = require('../lib/pkg_rules.js');
const { getPs5Config } = require('../lib/config.js');
const { sanitizeFolderName, resolveGameFolder, getBestTargetLibrary } = require('../lib/library_organizer.js');
const {
  STATUS,
  createState,
  decide,
  applyAttempt,
  reconcile,
  summarize,
  markInjected,
  markCompleted,
  markSkipped,
  matchesArtifact,
  loadState,
  saveState,
} = require('../lib/queue_state.js');

describe('pkg_rules — classifyPkg (nombres reales de la biblioteca)', () => {
  it('reconoce bases por v1.00 y por Game sin versión', () => {
    assert.equal(classifyPkg('A.Way.Out_CUSA08004_v1.00_[5.05]_OPOISSO893.pkg'), 'BASE');
    assert.equal(classifyPkg('[SuperPSX]-Overcooked.All.You.Can.Eat.PS4-CUSA23464-Game-(7.50+)-PS4.pkg'), 'BASE');
    assert.equal(classifyPkg('Homebrew-Store-PS5.pkg'), 'BASE');
    assert.equal(classifyPkg('UP9000-CUSA28561_00-A0100-V0100-CyB1K-[DLPSGAME.COM].pkg'), 'BASE');
  });

  it('reconoce updates por palabra y por versión superior', () => {
    assert.equal(classifyPkg('A.Way.Out_CUSA08004_v1.01_[5.05]_OPOISSO893.pkg'), 'UPDATE');
    assert.equal(classifyPkg('MLB.The.Show.24_CUSA43942_v1.21_[11.00]_OPOISSO893.pkg'), 'UPDATE');
    assert.equal(classifyPkg('[SPSX]-Crash.Team.Racing.Nitro.Fueled-CUSA13795-USA-Update-v1.21-(6.72+)-PS4.pkg'), 'UPDATE');
    assert.equal(classifyPkg('CUSA01967_HORIZON_ZERO_DAWN_UPDATEv1.54_FXD_[FW750].pkg'), 'UPDATE');
  });

  it('reconoce DLCs por entitlement, dlc, season pass y unlocker', () => {
    assert.equal(classifyPkg('[BO1-Season-Pass]-UP0002-CUSA57547_00-CODBO1SEASONPASS-A0000-V0100.pkg'), 'DLC');
    assert.equal(classifyPkg('CUSA01967_HORIZON_ZERO_DAWN_THE_FROZEN_WILDS_DLC_FXD.pkg'), 'DLC');
    assert.equal(classifyPkg('EA.SPORTS.FC.27_CUSA57220_UNLOCK_OFFLINE_OPOISSO893.pkg'), 'DLC');
  });

  it('reconoce FIX como categoría propia (no UPDATE)', () => {
    assert.equal(classifyPkg('[DLPSGAME.COM]-BO1_CUSA57547_v1.08_FIX_[5.05].pkg'), 'FIX');
    assert.equal(classifyPkg('It.Takes.Two_CUSA16742_v1.03_OptionalFix_[8.00]_OPOISSO893.pkg'), 'FIX');
  });

  it('trata FullGame como BASE aunque traiga versión mayor', () => {
    assert.equal(classifyPkg('It.Takes.Two_CUSA16742_v1.03_FullGame_[8.00]_OPOISSO893.pkg'), 'BASE');
  });
});

describe('pkg_rules — getTitleId', () => {
  it('extrae el Title ID real', () => {
    assert.equal(getTitleId('CUSA13795_CTR_NITRO-FUELED_DELUXE_PACK_DLC_FXD.pkg'), 'CUSA13795');
    assert.equal(getTitleId('x_PPSA01234_something.pkg'), 'PPSA01234');
  });

  it('agrupa como UNKNOWN lo que no tiene Title ID', () => {
    assert.equal(getTitleId('Random_Repack_Base.pkg').startsWith('UNKNOWN_'), true);
  });
});

describe('pkg_rules — planInstallOrder (cascada)', () => {
  const base = 'GameX_CUSA11111_v1.00.pkg';
  const update = 'GameX_CUSA11111_v1.05.pkg';
  const dlc = 'GameX_CUSA11111_BONUS_PACK_DLC.pkg';

  it('instala primero la base y retiene updates y DLCs', () => {
    const res = planInstallOrder([base, update, dlc], []);
    assert.deepEqual(res.plan, [base]);
    assert.equal(res.held.length, 2);
    assert.equal(res.held.every((h) => h.reason.includes('cascada')), true);
  });

  it('con la base ya instalada planifica update y DLC', () => {
    const res = planInstallOrder([base, update, dlc], [base]);
    assert.deepEqual(res.plan, [update, dlc]);
    assert.equal(res.held.length, 0);
  });

  it('usa un FIX como sustituto de base cuando no hay base', () => {
    const fix = 'GameY_CUSA22222_v1.08_FIX.pkg';
    const res = planInstallOrder([fix, update, dlc], []);
    assert.deepEqual(res.plan, [fix]);
  });

  it('si hay base en el lote, el FIX queda retenido como redundante', () => {
    const fix = 'GameZ_CUSA33333_v1.08_FIX.pkg';
    const baseZ = 'GameZ_CUSA33333_v1.00.pkg';
    const res = planInstallOrder([baseZ, fix], []);
    assert.deepEqual(res.plan, [baseZ]);
    assert.equal(res.held[0].reason.includes('FIX redundante'), true);
  });

  it('no re-planifica lo ya instalado (case-insensitive)', () => {
    const res = planInstallOrder([base.toUpperCase(), update], [base]);
    assert.deepEqual(res.plan, [update]);
  });

  it('IDs UNKNOWN no esperan base', () => {
    const res = planInstallOrder(['SomeRepack_Update_v2.01.pkg'], []);
    assert.deepEqual(res.plan, ['SomeRepack_Update_v2.01.pkg']);
  });
});

describe('queue_state — decide', () => {
  const items = [
    { name: 'Spider-Man (2018)', url: 'https://a/1' },
    { name: 'Miles Morales', url: 'https://a/2' },
  ];

  it('con IDM ocupado y nada inyectado espera (no interfiere)', () => {
    const state = createState(items);
    assert.equal(decide(state, { idmBusy: true, now: 1 }).type, 'wait');
  });

  it('con IDM ocupado y una inyección activa espera', () => {
    const state = createState(items);
    markInjected(state, 0);
    assert.equal(decide(state, { idmBusy: true, now: 1 }).type, 'wait');
  });

  it('con IDM libre y una inyección activa completa el item', () => {
    const state = createState(items);
    markInjected(state, 0);
    const action = decide(state, { idmBusy: false, now: 1 });
    assert.deepEqual(action, { type: 'complete', index: 0 });
  });

  it('con IDM libre inyecta el siguiente pendiente', () => {
    const state = createState(items);
    markCompleted(state, 0);
    assert.deepEqual(decide(state, { idmBusy: false, now: 1 }), { type: 'inject', index: 1 });
  });

  it('cola terminada devuelve none', () => {
    const state = createState(items);
    markCompleted(state, 0);
    markSkipped(state, 1);
    assert.equal(decide(state, { idmBusy: false, now: 1 }).type, 'none');
  });
});

describe('queue_state — backoff y reconciliación', () => {
  const opts = { now: 1000, baseMs: 1000, maxMs: 8000, maxAttempts: 3 };

  it('aplica backoff exponencial y falla al llegar al máximo', () => {
    const state = createState([{ name: 'A', url: 'u' }]);
    const first = applyAttempt(state, 0, opts);
    assert.equal(first.failed, false);
    assert.equal(state.items[0].nextAttemptAt, 2000);
    applyAttempt(state, 0, { ...opts, now: 5000 });
    const third = applyAttempt(state, 0, { ...opts, now: 9000 });
    assert.equal(third.failed, true);
    assert.equal(state.items[0].status, STATUS.FAILED);
  });

  it('un pendiente en backoff no es elegible todavía', () => {
    const state = createState([{ name: 'A', url: 'u' }]);
    state.items[0].nextAttemptAt = 999999;
    assert.equal(decide(state, { idmBusy: false, now: 1 }).type, 'wait');
  });

  it('reconciliación marca completed los items ya presentes en disco', () => {
    const state = createState([
      { name: 'God of War Ragnarök - Base', url: 'u1' },
      { name: 'Horizon Forbidden West', url: 'u2' },
    ]);
    const changed = reconcile(state, ['God.of.War.Ragnarok.PS4-CUSA34386-[DLPSGAME.COM].rar']);
    assert.equal(changed, 1);
    assert.equal(state.items[0].status, STATUS.COMPLETED);
    assert.equal(state.items[1].status, STATUS.PENDING);
  });

  it('matchesArtifact no confunde juegos parecidos', () => {
    assert.equal(matchesArtifact('Spider-Man (2018)', 'Spiderman.2018.Repack.rar'), true);
    assert.equal(matchesArtifact('Spider-Man: Miles Morales', 'Spiderman.2018.Repack.rar'), false);
    assert.equal(matchesArtifact('Naruto Storm 4', 'Naruto.Storm.4.Road.to.Boruto.pkg'), true);
    assert.equal(matchesArtifact('Horizon Forbidden West', 'Horizon.Zero.Dawn.Complete.Edition.rar'), false);
  });

  it('matchesArtifact ignora acentos en ambos sentidos', () => {
    assert.equal(matchesArtifact('God of War Ragnarök - Base', 'God.of.War.Ragnarok.Base.pkg'), true);
    assert.equal(matchesArtifact('God of War Ragnarok - Base', 'God.of.War.Ragnarök.Base.pkg'), true);
  });

  it('reconciliación por etiqueta completa items cuyo archivo no comparte tokens', () => {
    const state = createState([
      { name: 'God of War 2018 - Update 1.36', url: 'u', tags: ['G_07410', 'CUSA07410'] },
    ]);
    const changed = reconcile(state, ['G_07410_v1.36_[5.05]_OPOISSO893-[DLPSGAME.COM].rar']);
    assert.equal(changed, 1);
    assert.equal(state.items[0].status, STATUS.COMPLETED);
    assert.equal(state.items[0].note.includes('etiqueta'), true);
  });

  it('un artefacto del DLC no completa el BASE cuando comparten tokens', () => {
    const state = createState([
      { name: 'God of War Ragnarök - Base', url: 'u1' },
      { name: 'God of War Ragnarök - Valhalla DLC', url: 'u2' },
    ]);
    const changed = reconcile(state, ['God.of.War.Ragnarok.Valhalla.DLC.pkg']);
    assert.equal(changed, 1);
    assert.equal(state.items[0].status, STATUS.PENDING);
    assert.equal(state.items[1].status, STATUS.COMPLETED);
  });

  it('getPs5Config entrega IP, puertos y bibliotecas por defecto', () => {
    const cfg = getPs5Config();
    assert.equal(cfg.ps5.ip, '192.168.2.2');
    assert.equal(cfg.ps5.serverPort, 9898);
    assert.equal(cfg.paths.libraryDirs.length > 0, true);
  });

  it('saveState/loadState hacen round-trip atómico', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps5-state-'));
    const file = path.join(dir, 'queue_state.json');
    const state = createState([{ name: 'X', url: 'u' }]);
    markInjected(state, 0);
    saveState(file, state);
    const loaded = loadState(file);
    assert.equal(loaded.version, 1);
    assert.equal(loaded.items[0].status, STATUS.INJECTED);
  });

  it('loadState devuelve cola vacía si falta o está corrupto el archivo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps5-state-'));
    assert.deepEqual(loadState(path.join(dir, 'nope.json')).items, []);
    const file = path.join(dir, 'bad.json');
    fs.writeFileSync(file, '{ no-json');
    assert.deepEqual(loadState(file).items, []);
  });

  it('summarize cuenta estados y señala el siguiente', () => {
    const state = createState([
      { name: 'A', url: 'u' },
      { name: 'B', url: 'u' },
      { name: 'C', url: 'u' },
    ]);
    markCompleted(state, 0);
    markInjected(state, 1);
    const summary = summarize(state);
    assert.equal(summary.total, 3);
    assert.equal(summary.pending, 1);
    assert.equal(summary.injected, 1);
    assert.equal(summary.completed, 1);
    assert.equal(summary.failed, 0);
    assert.equal(summary.skipped, 0);
    assert.equal(summary.next, 'B [injected]');
  });
});

describe('library_organizer — sanitización y balanceo de biblioteca', () => {
  it('sanitiza nombres de carpetas eliminando caracteres inválidos', () => {
    assert.equal(sanitizeFolderName('God: of "War" *Ragnarök*?'), 'God of War Ragnarök');
  });

  it('determina carpeta adecuada para TitleID', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ps5-lib-'));
    const folder = resolveGameFolder(dir, 'God of War Ragnarök', 'CUSA34384');
    assert.equal(folder.endsWith('God of War Ragnarök (CUSA34384)'), true);
  });

  it('getBestTargetLibrary entrega ruta válida de biblioteca', () => {
    const target = getBestTargetLibrary('E:\\test.pkg');
    assert.equal(target.includes('Biblioteca_Juegos_PS'), true);
  });
});

