#!/usr/bin/env node
/**
 * @file send_inventory.js
 * @description Inventario final por juego: piezas esperadas vs presentes en disco
 *   (validadas) + estado en cola. Envía tabla con % y faltantes a Telegram.
 * Uso: node pipeline/scripts/send_inventory.js [--telegram]
 * SRP < 160L.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validatePkg } = require('../lib/pkg_validator.js');
const { getPs5Config } = require('../lib/config.js');
const { sendTelegramMessage } = require('../lib/telegram.js');

// Piezas esperadas por TitleID principal { base, update, dlc }
const EXPECTED = {
  CUSA34384: { name: 'GoW Ragnarök', base: 1, update: 1, dlc: 0, gb: 106.7 },
  CUSA43942: { name: 'MLB The Show 24', base: 1, update: 1, dlc: 0, gb: 82.3 },
  CUSA28561: { name: 'Horizon Forbidden West', base: 1, update: 1, dlc: 2, gb: 73.7 },
  CUSA24705: { name: 'Horizon Forbidden West', base: 0, update: 0, dlc: 2, gb: 0 },
  CUSA11518: { name: 'Mortal Kombat 11', base: 1, update: 1, dlc: 0, gb: 69.4 },
  CUSA02299: { name: 'Spider-Man 2018', base: 1, update: 1, dlc: 4, gb: 63 },
  CUSA17722: { name: 'Miles Morales', base: 1, update: 1, dlc: 0, gb: 50.6 },
  CUSA01967: { name: 'Horizon Zero Dawn', base: 1, update: 1, dlc: 11, gb: 47.4 },
  CUSA13323: { name: 'Ghost of Tsushima DC', base: 1, update: 1, dlc: 1, gb: 45.4 },
  CUSA07408: { name: 'God of War 2018', base: 1, update: 1, dlc: 8, gb: 43.5 },
  CUSA03173: { name: 'Bloodborne GOTY', base: 1, update: 1, dlc: 1, gb: 45 },
  CUSA57220: { name: 'FC 27', base: 1, update: 1, dlc: 1, gb: 73 },
  CUSA16742: { name: 'It Takes Two', base: 1, update: 1, dlc: 0, gb: 34.3 },
  CUSA13795: { name: 'Crash Team Racing', base: 1, update: 1, dlc: 1, gb: 28.6 },
  CUSA07995: { name: 'A Way Out', base: 1, update: 1, dlc: 0, gb: 15.9 },
  CUSA23384: { name: 'Haven', base: 1, update: 1, dlc: 0, gb: 4.3 },
};

function walkPkgs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walkPkgs(f, out);
    else if (e.name.toLowerCase().endsWith('.pkg')) out.push(f);
  }
  return out;
}

function main() {
  const cfg = getPs5Config();
  const found = {}; // titleId -> { base, update, dlc }
  for (const lib of cfg.paths.libraryDirs) {
    for (const f of walkPkgs(lib)) {
      try {
        const r = validatePkg(f);
        if (!r.valid) continue;
        const tid = (r.info.titleId || '').toUpperCase();
        const cat = (r.info.category || '').toUpperCase();
        if (!EXPECTED[tid]) continue;
        found[tid] = found[tid] || { base: 0, update: 0, dlc: 0 };
        if (cat === 'BASE') found[tid].base += 1;
        else if (cat === 'UPDATE') found[tid].update += 1;
        else found[tid].dlc += 1;
      } catch {}
    }
  }
  // Estado en cola (en vuelo / pendiente)
  let queue = { items: [] };
  try { queue = JSON.parse(fs.readFileSync(cfg.state.queueFile, 'utf8')); } catch {}
  const inFlight = {};
  for (const it of queue.items) {
    if (it.status !== 'downloading' && it.status !== 'pending') continue;
    for (const t of it.tags || []) {
      const tid = String(t).toUpperCase();
      if (EXPECTED[tid]) inFlight[tid] = (inFlight[tid] || 0) + 1;
    }
  }

  const merged = {}; // nombre -> { exp, got, missing:[], flight, gb }
  for (const [tid, exp] of Object.entries(EXPECTED)) {
    const g = (merged[exp.name] = merged[exp.name] || { exp: { base: 0, update: 0, dlc: 0 }, got: { base: 0, update: 0, dlc: 0 }, gb: exp.gb, flight: 0 });
    g.exp.base += exp.base; g.exp.update += exp.update; g.exp.dlc += exp.dlc;
    const f = found[tid] || { base: 0, update: 0, dlc: 0 };
    g.got.base += Math.min(f.base, exp.base);
    g.got.update += Math.min(f.update, exp.update);
    g.got.dlc += Math.min(f.dlc, exp.dlc);
    g.flight += inFlight[tid] || 0;
  }

  const lines = ['🎮 *Inventario final PS5 (base+update+DLC)*'];
  let totalGb = 0;
  let done = 0;
  const order = Object.keys(merged).sort((a, b) => merged[b].gb - merged[a].gb);
  for (const name of order) {
    const g = merged[name];
    const expTot = g.exp.base + g.exp.update + g.exp.dlc;
    const gotTot = g.got.base + g.got.update + g.got.dlc;
    const pct = expTot === 0 ? 100 : Math.round((gotTot / expTot) * 100);
    const miss = [];
    if (g.got.base < g.exp.base) miss.push('base');
    if (g.got.update < g.exp.update) miss.push('update');
    if (g.got.dlc < g.exp.dlc) miss.push(`${g.exp.dlc - g.got.dlc} DLC`);
    const icon = pct === 100 ? '✅' : g.flight > 0 ? '⬇️' : '⏳';
    lines.push(`${icon} *${name}* — ${pct}%${miss.length ? ` (falta: ${miss.join(', ')})` : ''}`);
    if (pct === 100) { done += 1; totalGb += g.gb; }
  }
  lines.push(`\nCompletos: ${done}/${order.length} juegos (${totalGb.toFixed(0)} GB en biblioteca)`);
  const msg = lines.join('\n');
  console.log(msg.replace(/\*/g, ''));
  if (process.argv.includes('--telegram')) {
    sendTelegramMessage(msg).then((ok) => console.log(ok ? 'Telegram OK' : 'Telegram FALLO'));
  }
}

main();
