/**
 * @file artifact_match.js
 * @description Emparejamiento item-de-cola ↔ artefacto descargado: tokens del nombre
 *   (sin stopwords, sin acentos) + etiquetas explícitas (`tags`). Puro y testeable.
 *   Nace de la verdad de disco del 01-oct: `G_07410_v1.36_...` no comparte tokens con
 *   "God of War 2018 - Update 1.36" → esos casos se declaran con tags.
 * SRP < 300L.
 */

const STOPWORDS = new Set([
  'base', 'update', 'dlc', 'fix', 'the', 'of', 'and', 'y', 'de', 'del', 'la', 'el',
  'edition', 'complete', 'remastered', 'pack', 'clean',
]);

/**
 * Quita diacríticos (ö → o) para comparar nombres con y sin tilde.
 * @param {string} text
 * @returns {string}
 */
function stripDiacritics(text) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * @param {string} name
 * @returns {string[]} tokens significativos (>=3 chars, sin stopwords, sin acentos)
 */
function slugTokens(name) {
  return stripDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * @param {string} name
 * @returns {string}
 */
function compact(name) {
  return stripDiacritics(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * ¿El nombre del item corresponde a un artefacto ya presente en disco?
 * Todos los tokens del item deben aparecer dentro del nombre del artefacto.
 * @param {string} itemName
 * @param {string} artifactFilename
 * @returns {boolean}
 */
function matchesArtifact(itemName, artifactFilename) {
  const tokens = slugTokens(itemName);
  if (tokens.length === 0) return false;
  const target = compact(artifactFilename);
  if (target.length < 4) return false;
  return tokens.every((t) => target.includes(t));
}

/**
 * ¿Alguna etiqueta explícita del item aparece en el nombre del artefacto?
 * Para archivos cuyo nombre no comparte tokens con el item (ej. `G_07410_v1.36_...`).
 * @param {string[]|undefined} tags
 * @param {string} artifactFilename
 * @returns {boolean}
 */
function matchesTags(tags, artifactFilename) {
  if (!Array.isArray(tags) || tags.length === 0) return false;
  const target = compact(artifactFilename);
  return tags.some((tag) => {
    const needle = compact(tag);
    return needle.length >= 4 && target.includes(needle);
  });
}

/**
 * ¿Los tokens de `inner` son subconjunto ESTRICTO de los de `outer`?
 * Guard anti-sombra: un artefacto del DLC no debe completar la base cuando ambos
 * comparten tokens (ej. "God of War Ragnarök - Base" vs "... - Valhalla DLC").
 * @param {string[]} inner
 * @param {string[]} outer
 * @returns {boolean}
 */
function isStrictSubset(inner, outer) {
  if (inner.length === 0 || inner.length >= outer.length) return false;
  const set = new Set(outer);
  return inner.every((t) => set.has(t));
}

module.exports = {
  STOPWORDS,
  stripDiacritics,
  slugTokens,
  compact,
  matchesArtifact,
  matchesTags,
  isStrictSubset,
};
