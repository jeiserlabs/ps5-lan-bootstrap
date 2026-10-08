/**
 * @file ps5_compatibility.test.js
 * @description Pruebas del filtro de compatibilidad PS4→PS5: bloqueos por
 *   evidencia local, no-contaminación con la lista de foros, parser del ledger
 *   real y verificación de firmware de payloads. Incluye las guardas anti-regresión
 *   que fallarían si alguien "implementa" la blocklist de foros a ciegas.
 * SRP < 250L.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {
  checkCompatibility,
  isInstallBlocked,
  contradictedSceneReports,
  deterministicRejection,
  groupStalls,
  parseStallEvidence,
  parseSuccessEvidence,
  compareFirmware,
  checkPayloadFirmware,
  loadPayloadCompatibility,
} = require('../lib/ps5_compatibility.js');
const { validatePkg, PKG_MAGIC, SFO_MAGIC } = require('../lib/pkg_validator.js');

// ---------------------------------------------------------------------------
// Utilerías: PKG sintético ESTRUCTURALMENTE VÁLIDO (para el hook del validador)
// ---------------------------------------------------------------------------

function buildSfo(pairs) {
  const n = pairs.length;
  const keyTableStart = 20 + n * 16;
  const keyBufs = pairs.map(([k]) => Buffer.from(`${k}\0`, 'utf8'));
  const dataTableStart = keyTableStart + keyBufs.reduce((a, b) => a + b.length, 0);
  const dataBufs = pairs.map(([, v]) => Buffer.from(`${v}\0`, 'utf8'));
  const buf = Buffer.alloc(dataTableStart + dataBufs.reduce((a, b) => a + b.length, 0) + 16);
  buf.set(SFO_MAGIC, 0);
  buf.writeUInt32LE(0x00000101, 4);
  buf.writeUInt32LE(keyTableStart, 8);
  buf.writeUInt32LE(dataTableStart, 12);
  buf.writeUInt32LE(n, 16);
  let keyOff = 0;
  let dataOff = 0;
  pairs.forEach((_, i) => {
    const off = 20 + i * 16;
    buf.writeUInt16LE(keyOff, off);
    buf.writeUInt16LE(0x0204, off + 2);
    buf.writeUInt32LE(dataBufs[i].length, off + 4);
    buf.writeUInt32LE(dataBufs[i].length, off + 8);
    buf.writeUInt32LE(dataOff, off + 12);
    keyBufs[i].copy(buf, keyTableStart + keyOff);
    dataBufs[i].copy(buf, dataTableStart + dataOff);
    keyOff += keyBufs[i].length;
    dataOff += dataBufs[i].length;
  });
  return buf;
}

function buildValidPkg(filePath, titleId) {
  const SIZE = 0x20000; // 128 KB: por encima de 16 KB y sin barrera de muestreo (solo >1 GB)
  const buf = Buffer.alloc(SIZE, 0x41);
  PKG_MAGIC.copy(buf, 0);
  buf.write(`EP9000-${titleId}_00-00000000000000`, 0x40, 'utf8');
  buf.writeUInt32BE(1, 0x10);
  buf.writeUInt32BE(0x1000, 0x18);
  buf.writeBigUInt64BE(BigInt(SIZE), 0x418);
  buf.writeBigUInt64BE(0n, 0x420);
  buf.writeBigUInt64BE(0n, 0x428);
  const sfo = buildSfo([
    ['APP_VER', '01.00'],
    ['CATEGORY', 'gd'],
    ['TITLE', 'Test Game'],
    ['TITLE_ID', titleId],
  ]);
  const sfoOffset = 0x2000;
  sfo.copy(buf, sfoOffset);
  buf.writeUInt32BE(0x1000, 0x1000);
  buf.writeUInt32BE(sfoOffset, 0x1000 + 16);
  buf.writeUInt32BE(sfo.length, 0x1000 + 20);
  fs.writeFileSync(filePath, buf);
}

// ---------------------------------------------------------------------------
// checkCompatibility
// ---------------------------------------------------------------------------

test('compat: CUSA34386 (GoW Ragnarök EU) se bloquea con evidencia local', () => {
  const res = checkCompatibility('CUSA34386');
  assert.equal(res.compatible, false);
  assert.equal(res.severity, 'block');
  assert.match(res.reason, /13\.17 GB|determinista/i);
  assert.match(res.action, /Package Installer/i);
  assert.equal(isInstallBlocked('CUSA34386_v1.00_[9.00]_OPOISSO893-[DLPSGAME.COM].pkg'), true);
});

test('compat: CUSA34384 (GoW Ragnarök US) AVISA pero NO bloquea (descarga en curso)', () => {
  const res = checkCompatibility('UP9000-CUSA34384_00-A0100-V0100 [ High-Speed ]-[DLPSGAME.COM].pkg');
  assert.equal(res.compatible, true);
  assert.equal(res.severity, 'warn');
});

test('compat: títulos instalados y sin evidencia de fallo son compatibles (fail-open)', () => {
  for (const id of ['CUSA02299', 'CUSA10213', 'CUSA43942', 'CUSA23384']) {
    const res = checkCompatibility(id);
    assert.equal(res.compatible, true, `${id} debería ser compatible`);
    assert.equal(res.severity, 'ok');
  }
  // CUSA28561 está en la lista de foros → compatible pero con anotación informativa.
  const forbiddenWest = checkCompatibility('CUSA28561');
  assert.equal(forbiddenWest.compatible, true);
  assert.equal(forbiddenWest.severity, 'info');
  assert.equal(checkCompatibility('archivo_sin_cusa.pkg').compatible, true);
  assert.equal(checkCompatibility('').titleId, '');
});

test('compat: la lista de FOROS del informe no bloquea nada (guarda anti-contaminación)', () => {
  // Títulos exactos que el informe de auditoría marcaba como "incompatibles".
  const informe = ['CUSA13323', 'CUSA07408', 'CUSA28561', 'CUSA13795', 'CUSA16742', 'CUSA20499', 'CUSA57220', 'CUSA57447', 'CUSA30992', 'CUSA34386'];
  for (const id of informe) {
    const res = checkCompatibility(id);
    if (id === 'CUSA34386') {
      assert.equal(res.compatible, false, 'CUSA34386 sí tiene evidencia local determinista');
      continue;
    }
    assert.equal(res.compatible, true, `${id} NO debe bloquearse por un reporte de foro`);
    assert.ok(['ok', 'info', 'warn'].includes(res.severity));
  }
});

test('compat: los juegos reportados por foros y CONFIRMADOS instalados quedan como info', () => {
  const contradichos = contradictedSceneReports();
  assert.ok(contradichos.includes('CUSA13323'));
  assert.ok(contradichos.includes('CUSA07408'));
  for (const id of contradichos) {
    const res = checkCompatibility(id);
    assert.equal(res.compatible, true, `${id} está instalado en la consola real`);
    assert.equal(res.severity, 'info');
    assert.equal(res.sceneReport.localAudit, 'installed');
  }
});

// ---------------------------------------------------------------------------
// Evidencia derivada del ledger real
// ---------------------------------------------------------------------------

test('compat: deterministicRejection exige el MISMO byte (tolerancia) 2+ veces', () => {
  assert.equal(deterministicRejection([13.17e9, 13.19e9]).deterministic, true);
  assert.equal(deterministicRejection([3.31e9, 37.88e9]).deterministic, false);
  assert.equal(deterministicRejection([13.17e9]).deterministic, false);
  assert.equal(deterministicRejection([]).deterministic, false);
  const r = deterministicRejection([13.17e9, 13.19e9]);
  assert.ok(Math.abs(r.byte - 13.17e9) < 1e9);
  assert.equal(r.repeats, 2);
});

test('compat: groupStalls separa el bug de reentrancia (3.31 GB) del rechazo real (13.17 GB)', () => {
  const clusters = groupStalls([
    ...Array(34).fill(3.31e9),
    ...Array(2).fill(13.17e9),
    ...Array(2).fill(13.19e9),
  ]);
  assert.equal(clusters.length, 2);
  assert.equal(clusters[0].count, 34);
  assert.equal(clusters[1].count, 4, '13.17 y 13.19 GB caen en el mismo cluster (±64 MB)');
  assert.ok(Math.abs(clusters[1].byte - 13.18e9) < 0.1e9);
});

test('compat: parseStallEvidence atribuye estancamientos al título del lote', () => {
  const log = [
    '[2026-10-07T17:20:11Z] [LAN_INSTALLER] ▶️ Preparando: [CUSA34386] CUSA34386_v1.00_[9.00].pkg (BASE, 84.40 GB)',
    '[2026-10-07T17:25:06Z] [LAN_INSTALLER] ❌ Transferencia estancada a los 13.19 GB. Abortando.',
    '[2026-10-07T18:41:14Z] [LAN_INSTALLER] ❌ Transferencia estancada a los 13.17 GB. Abortando.',
    '[2026-10-07T19:00:00Z] [LAN_INSTALLER] ▶️ Preparando: [CUSA01967] CUSA01967-USA-Game.pkg (BASE, 37.65 GB)',
    '[2026-10-07T19:30:00Z] [LAN_INSTALLER] ❌ Transferencia estancada a los 37.88 GB. Abortando.',
  ].join('\n');
  const res = parseStallEvidence(log);
  assert.equal(res.CUSA34386.count, 2);
  assert.equal(res.CUSA34386.deterministic, true);
  assert.deepEqual(res.CUSA34386.stallsGb, [13.19, 13.17]);
  assert.deepEqual(res.CUSA34386.bytes, [13190000000, 13170000000]);
  assert.equal(res.CUSA01967.count, 1);
  assert.equal(res.CUSA01967.deterministic, false);
});

test('compat: parseSuccessEvidence extrae los títulos instalados y verificados', () => {
  const log = [
    '[LAN_INSTALLER] ✅ INSTALACIÓN COMPLETADA Y VERIFICADA: UP9000-CUSA28561_00-A0100-V0100.pkg',
    '[LAN_INSTALLER] ✅ INSTALACIÓN COMPLETADA Y VERIFICADA: CUSA13323_BASE.pkg',
    '[LAN_INSTALLER] ❌ Instalación de CUSA34386_v1.00.pkg falló o no superó la verificación.',
  ].join('\n');
  const ids = parseSuccessEvidence(log);
  assert.deepEqual(ids.sort(), ['CUSA13323', 'CUSA28561']);
});

// ---------------------------------------------------------------------------
// Verificación de firmware de payloads
// ---------------------------------------------------------------------------

test('compat: compareFirmware ordena versiones de FW', () => {
  assert.equal(compareFirmware('13.40', '11.60'), 1);
  assert.equal(compareFirmware('7.00', '13.40'), -1);
  assert.equal(compareFirmware('13.40', '13.40'), 0);
  assert.equal(compareFirmware('', '13.40'), 0);
});

test('compat: checkPayloadFirmware valida la matriz real de payloads', () => {
  const matrix = loadPayloadCompatibility();
  assert.ok(matrix && matrix.payloads, 'payloads/compatibility.json debe existir');
  const ok = checkPayloadFirmware('kstuff.elf', '13.40', matrix);
  assert.equal(ok.known, true);
  assert.equal(ok.compatible, true);
  const bad = checkPayloadFirmware('kstuff.elf', '14.10', matrix);
  assert.equal(bad.compatible, false, 'FW 14.10 fuera del rango declarado');
  assert.match(bad.reason, /hasta FW 13\.60/);
  // Todo payload listado en el updater debe tener entrada en la matriz.
  const { checkPayloadUpdates } = require('../scripts/update_payloads.js');
  assert.equal(typeof checkPayloadUpdates, 'function');
  const autoloader = checkPayloadFirmware('webkit-autoloader', '13.40', matrix);
  assert.equal(autoloader.known, true, 'webkit-autoloader debe estar en la matriz');
});

test('compat: payload sin entrada en la matriz NO se marca compatible ni bloquea', () => {
  const res = checkPayloadFirmware('payload-desconocido.elf', '13.40', { payloads: {} });
  assert.equal(res.known, false);
  assert.equal(res.compatible, false);
});

// ---------------------------------------------------------------------------
// Enganche en el pipeline (guarda anti-regresión de integración)
// ---------------------------------------------------------------------------

test('compat: pkg_validator anota la compatibilidad y solo rechaza con enforcement', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'pkg_validator.js'), 'utf8');
  assert.match(src, /checkCompatibility\(info\.titleId\)/);
  assert.match(src, /opts\.enforceCompatibility/);

  const tmp = path.join(os.tmpdir(), 'compat_blocked_title.pkg');
  buildValidPkg(tmp, 'CUSA34386');
  try {
    const advisory = validatePkg(tmp);
    assert.equal(advisory.valid, true, 'la integridad del archivo es válida');
    assert.equal(advisory.info.compatibility.compatible, false);
    assert.ok(advisory.warnings.some((w) => w.includes('TÍTULO INCOMPATIBLE')));

    const enforced = validatePkg(tmp, { enforceCompatibility: true });
    assert.equal(enforced.valid, false);
    assert.ok(enforced.errors.some((e) => e.includes('TÍTULO INCOMPATIBLE')));
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('compat: pkg_validator no se contamina con la lista de foros', () => {
  const tmp = path.join(os.tmpdir(), 'compat_gow2018_ok.pkg');
  buildValidPkg(tmp, 'CUSA07408');
  try {
    const res = validatePkg(tmp, { enforceCompatibility: true });
    assert.equal(res.valid, true, 'GoW 2018 (CUSA07408) está instalado y funciona: no puede rechazarse');
    assert.equal(res.errors.length, 0);
  } finally {
    fs.unlinkSync(tmp);
  }
});

test('compat: lan_installer bloquea ANTES de la guarda de espacio (no descarga)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'lan_installer.js'), 'utf8');
  const iCompat = src.indexOf('checkCompatibility(audit.info.titleId)');
  const iSpace = src.indexOf('requiredHeadroomBytes(audit.info.sizeBytes', iCompat);
  assert.ok(iCompat > -1, 'lan_installer debe consultar checkCompatibility');
  assert.ok(iSpace > iCompat, 'el bloqueo debe ir antes de reservar espacio/descargar');
  assert.match(src, /TÍTULO BLOQUEADO/);
});

test('compat: update_payloads consulta el FW de la consola antes de aplicar', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'update_payloads.js'), 'utf8');
  assert.match(src, /checkPayloadFirmware\(item\.name, consoleFw, matrix\)/);
  assert.match(src, /getPs5Config\(\)\.ps5\.firmware/);
  assert.match(src, /ABORTADO: no se aplica ninguna actualización con payloads incompatibles/);
  const { getPs5Config } = require('../lib/config.js');
  assert.match(getPs5Config().ps5.firmware, /^\d+\.\d+$/);
});
