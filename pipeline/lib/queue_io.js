/**
 * @file queue_io.js
 * @description Lectura/escritura de queue_state.json con lock exclusivo en disco.
 *   Evita pérdida por condición de carrera entre sprint, inbox y pilot
 *   (read-modify-write concurrente con tmp+rename NO es suficiente).
 * SRP < 120L.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {string} queueFile
 * @returns {{ release: () => void, queue: any } | null} null si lock ocupado tras reintentos
 */
async function loadLocked(queueFile, retries = 30) {
  const lockDir = `${queueFile}.lock`;
  for (let i = 0; i < retries; i++) {
    try {
      fs.mkdirSync(lockDir);
      break;
    } catch {
      if (i === retries - 1) return null;
      await sleep(200);
    }
  }
  let queue = { version: 1, items: [] };
  try {
    queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
  } catch {}
  let released = false;
  const release = (updated) => {
    if (released) return;
    released = true;
    try {
      if (updated) {
        updated.updatedAt = new Date().toISOString();
        const tmp = `${queueFile}.tmp.${Date.now()}.${process.pid}`;
        fs.writeFileSync(tmp, JSON.stringify(updated, null, 2) + '\n');
        fs.renameSync(tmp, queueFile);
      }
    } finally {
      try { fs.rmdirSync(lockDir); } catch {}
    }
  };
  return { queue, release };
}

module.exports = { loadLocked };
