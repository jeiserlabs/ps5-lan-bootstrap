/**
 * @file pkg_rules.js
 * @description Reglas deterministas de clasificación de PKGs PS4/PS5 y orden de
 *   instalación en cascada (BASE → UPDATE → DLC). Puro, sin IO: testeable.
 *   Reemplaza la heurística duplicada que vivía en el scratch de Antigravity.
 * SRP < 300L.
 */
const path = require('node:path');

const TITLE_ID_RE = /[A-Za-z]{4}\d{5}/;
const RE_UPDATE = /(^|[^a-z])(update|upd)([^a-z]|$)|_patch|patch_|updatev|_a0*[1-9]\d*-|-a0*[1-9]\d*-/;
const RE_DLC = /-a0000-|(^|[^a-z])(dlc(s)?|addon|seasonpass|season-pass|season pass|unlock|deluxe|valhalla|bonus|expansion|costume|accessory|accessories|preorder|item(s)?)([^a-z]|$)/;
const RE_FIX = /(^|[^a-z])fix([^a-z]|$)|_fix|fix_|optionalfix/;
const RE_MOD_BLOCK = /(^|[^a-z])mod([^a-z]|$)|unlock[_ .-]?all|all[_ .-]?unlock/;
const RE_FULLGAME = /fullgame|full\.game/;
const RE_VERSION = /v(\d+)\.(\d+)/;
const INSTALL_PRIORITY = { BASE: 0, FIX: 1, UPDATE: 2, DLC: 3 };

/**
 * @param {string} filename
 * @returns {string} Title ID (CUSA/PPSA/...) o UNKNOWN_<hash corto>
 */
function getTitleId(filenameOrPath) {
  const match = (filenameOrPath || '').match(TITLE_ID_RE);
  if (match) return match[0].toUpperCase();
  const compact = path.basename(filenameOrPath || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return `UNKNOWN_${compact.slice(0, 8) || 'EMPTY'}`;
}

/**
 * Clasifica un PKG por su nombre. Heurística de escena (no hay metadata dentro del nombre):
 * UPDATE > DLC > FIX > FullGame(BASE) > vX.YY (v1.00 = BASE) > BASE.
 * @param {string} filename
 * @returns {'BASE'|'UPDATE'|'DLC'|'FIX'}
 */
function classifyPkg(filename) {
  const name = filename.toLowerCase();
  // PSN: el UPDATE comparte app id con la base y solo cambia la versión.
  // `UP9000-CUSA07408_00-XXXX-A0100-V0134` es el UPDATE v1.34, NO una base: sin
  // esta distinción se clasificaba como BASE, y como la base de ese CUSA ya está
  // instalada, el planificador lo descartaba como duplicado y el update nunca se
  // instalaba (caso real: GoW 2018 CUSA07408 v1.34).
  if (/[-_]a0*100[-_]/.test(name)) {
    const version = name.match(/[-_]v0*(\d{1,4})[-_. ]/);
    if (version && Number(version[1]) > 100) return 'UPDATE';
    return 'BASE';
  }
  if (RE_UPDATE.test(name)) return 'UPDATE';
  if (RE_DLC.test(name)) return 'DLC';
  if (RE_FIX.test(name)) return 'FIX';
  if (RE_FULLGAME.test(name)) return 'BASE';
  const version = name.match(RE_VERSION);
  if (version) {
    const major = Number(version[1]);
    const minor = Number(version[2]);
    if (major > 1 || minor > 0) return 'UPDATE';
  }
  return 'BASE';
}

/**
 * Prioridad de instalación por categoría: cascada BASE → FIX → UPDATE → DLC.
 * El orquestador LAN planificaba por tamaño ascendente, lo que metía los DLC
 * (KB) antes que el UPDATE del mismo título y rompía la cascada documentada.
 * @param {string} filenameOrPath
 * @returns {number} menor = antes
 */
function installPriority(filenameOrPath) {
  return INSTALL_PRIORITY[classifyPkg(path.basename(filenameOrPath))] ?? 9;
}

/**
 * Agrupa PKGs por Title ID.
 * @param {string[]} pkgPaths
 * @returns {Map<string, string[]>}
 */
function groupByTitle(pkgPaths) {
  const groups = new Map();
  for (const pkgPath of pkgPaths) {
    const id = getTitleId(pkgPath);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(pkgPath);
  }
  return groups;
}

/**
 * Orden de instalación en cascada por lote:
 *   1) Si hay BASE pendiente → instalar solo bases; updates/DLCs retenidos.
 *   2) Si hay FIX y no hay base instalada ni pendiente → el FIX sustituye a la base.
 *   3) Con base ya instalada → updates, luego DLCs.
 *   4) IDs UNKNOWN → se planifican tal cual (no hay base que esperar).
 * @param {string[]} pkgPaths rutas o nombres de PKG
 * @param {string[]} installedBasenames basenames ya instalados en la PS5
 * @returns {{ plan: string[], held: Array<{ file: string, reason: string }> }}
 */
function planInstallOrder(pkgPaths, installedBasenames) {
  const installed = (installedBasenames || []).map((b) => b.toLowerCase());
  const installedKeys = new Set((installedBasenames || []).map((b) => `${getTitleId(b)}::${classifyPkg(b)}`));
  // SSOT anti-duplicados: coincidencia exacta por nombre O, para BASE/FIX
  // (uno por Title ID), por Title ID + categoría. Así un FULLGAME con otro
  // nombre no reinstala una base ya instalada. UPDATE/DLC siguen por nombre
  // exacto para no saltarse updates o DLCs genuinamente nuevos del mismo título.
  const isInstalled = (pkgPath) => {
    if (installed.includes(path.basename(pkgPath).toLowerCase())) return true;
    const cat = classifyPkg(path.basename(pkgPath));
    if (cat === 'BASE' || cat === 'FIX') {
      const id = getTitleId(pkgPath);
      return installedKeys.has(`${id}::BASE`) || installedKeys.has(`${id}::FIX`);
    }
    return false;
  };

  const unique = [];
  const seen = new Set();
  for (const pkgPath of pkgPaths) {
    const key = path.basename(pkgPath).toLowerCase();
    if (seen.has(key) || isInstalled(pkgPath)) continue;
    seen.add(key);
    unique.push(pkgPath);
  }

  const plan = [];
  const held = [];
  const groups = groupByTitle(unique);

const HELD_TITLES = new Set();

  for (const id of [...groups.keys()].sort()) {
    const files = /** @type {string[]} */ (groups.get(id)).slice().sort();
    if (HELD_TITLES.has(id)) {
      for (const file of files) held.push({ file, reason: 'retenido por orden del usuario (pausado hasta liberar SSD)' });
      continue;
    }
    // IDs UNKNOWN: sin Title ID no hay cascada que esperar — se planifican tal cual.
    if (id.startsWith('UNKNOWN_')) {
      plan.push(...files);
      continue;
    }
    /** @type {Record<string, string[]>} */
    const byCategory = { BASE: [], UPDATE: [], DLC: [], FIX: [] };
    for (const file of files) byCategory[classifyPkg(path.basename(file))].push(file);

    const baseInDb = installedKeys.has(`${id}::BASE`) || installedKeys.has(`${id}::FIX`);
    const holdUpdatesAndDlcs = (reason) => {
      for (const file of byCategory.UPDATE) held.push({ file, reason });
      for (const file of byCategory.DLC) held.push({ file, reason });
    };

    if (byCategory.BASE.length > 0) {
      plan.push(...byCategory.BASE);
      for (const file of byCategory.FIX) {
        held.push({ file, reason: 'FIX redundante: ya hay base en este lote' });
      }
      holdUpdatesAndDlcs('espera base instalada (cascada)');
    } else if (byCategory.FIX.length > 0 && !baseInDb) {
      plan.push(byCategory.FIX[0]);
      for (const file of byCategory.FIX.slice(1)) {
        held.push({ file, reason: 'FIX redundante: ya se planificó otro FIX como base' });
      }
      holdUpdatesAndDlcs('espera base instalada (cascada)');
    } else if (baseInDb) {
      plan.push(...byCategory.UPDATE, ...byCategory.DLC);
      for (const file of byCategory.FIX) {
        held.push({ file, reason: 'FIX redundante: la base ya está instalada' });
      }
    } else {
      for (const file of files) held.push({ file, reason: 'sin base detectada para el Title ID' });
    }
  }

  return { plan, held };
}

/**
 * Pico de espacio que la PS5 necesita para instalar un PKG por LAN.
 * El receiver descarga el PKG íntegro en /user/download y recién después el
 * instalador escribe el app/patch, así que durante la instalación conviven
 * ambos: ~2x el tamaño del PKG (dumps sin comprimir ≈ 1x el app; los PKG de
 * PSN comprimidos expanden hasta ~1.1x). Sin este cálculo el pipeline
 * descargaba 90 GB en un SSD con 85 GB libres: llenaba el disco y la
 * transferencia moría a mitad de camino.
 * @param {number} sizeBytes tamaño del PKG en bytes
 * @param {string} [category] BASE | FIX | UPDATE | DLC
 * @returns {number} bytes requeridos (0 cuando no hay tamaño conocido)
 */
function requiredHeadroomBytes(sizeBytes, category) {
  const size = Number(sizeBytes) || 0;
  if (size <= 0) return 0;
  const factor = category === 'UPDATE' || category === 'DLC' ? 1.5 : 2.05;
  return Math.ceil(size * factor) + 3 * 1024 ** 3;
}

module.exports = { classifyPkg, getTitleId, planInstallOrder, installPriority, isModBlocked, requiredHeadroomBytes };

/**
 * Detecta mods de contenido (Unlock-All y similares) que son
 * estructuralmente válidos pero panican el kernel en PS5 con kstuff.
 * Estos NUNCA entran al pipeline de instalación: van a cuarentena.
 * No confunde 'deluxe'/'model' (límites de palabra).
 * @param {string} filename
 * @returns {boolean}
 */
function isModBlocked(filename) {
  return RE_MOD_BLOCK.test((filename || '').toLowerCase());
}
