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
const RE_DLC = /-a0000-|(^|[^a-z])(dlc(s)?|addon|seasonpass|season-pass|season pass|unlock|deluxe|valhalla|bonus|expansion)([^a-z]|$)/;
const RE_FIX = /(^|[^a-z])fix([^a-z]|$)|_fix|fix_|optionalfix/;
const RE_FULLGAME = /fullgame|full\.game/;
const RE_VERSION = /v(\d+)\.(\d+)/;

/**
 * @param {string} filename
 * @returns {string} Title ID (CUSA/PPSA/...) o UNKNOWN_<hash corto>
 */
function getTitleId(filename) {
  const match = filename.match(TITLE_ID_RE);
  if (match) return match[0].toUpperCase();
  const compact = filename.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
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
  if (/[-_]a0100-/.test(name)) return 'BASE';
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
 * Agrupa PKGs por Title ID.
 * @param {string[]} pkgPaths
 * @returns {Map<string, string[]>}
 */
function groupByTitle(pkgPaths) {
  const groups = new Map();
  for (const pkgPath of pkgPaths) {
    const id = getTitleId(path.basename(pkgPath));
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
  const isInstalled = (pkgPath) => installed.includes(path.basename(pkgPath).toLowerCase());

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

  for (const id of [...groups.keys()].sort()) {
    const files = /** @type {string[]} */ (groups.get(id)).slice().sort();
    /** @type {Record<string, string[]>} */
    const byCategory = { BASE: [], UPDATE: [], DLC: [], FIX: [] };
    for (const file of files) byCategory[classifyPkg(path.basename(file))].push(file);

    const baseInDb = id.startsWith('UNKNOWN') || installedKeys.has(`${id}::BASE`) || installedKeys.has(`${id}::FIX`);
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

module.exports = { classifyPkg, getTitleId, planInstallOrder };
