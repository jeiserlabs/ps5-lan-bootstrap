#!/usr/bin/env node
/**
 * @file check_links.js
 * @description Salud de enlaces firmados de la cola aria2c (era post-IDM).
 *   AkiraBox firma URLs con `access=<epoch-ms>` (= expiración aprox).
 *   Este script NO descarga nada: lee la cola y reporta expiración por ítem.
 *   OJO: AkiraBox responde 403 a sondas sin cookies de sesión, así que un
 *   probe HTTP daría falsos negativos — solo se reporta el reloj de expiración.
 * Uso: node pipeline/scripts/check_links.js
 * SRP < 120L. Cero dependencias.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPs5Config } = require('../lib/config.js');

const cfg = getPs5Config();
const QUEUE_FILE = cfg.state.queueFile || path.join(cfg.state.cacheDir, 'queue_state.json');

function expiryOf(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/[?&](access|expiration)=(\d+)/);
  if (!m) return null;
  let ts = Number(m[2]);
  if (m[1] === 'expiration' || ts < 1e12) ts *= 1000; // expiration viene en segundos
  return new Date(ts);
}

function main() {
  let queue = { items: [] };
  try {
    queue = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
  } catch {
    console.error(`No se pudo leer la cola: ${QUEUE_FILE}`);
    process.exit(1);
  }
  const now = Date.now();
  const live = queue.items.filter((i) => i.status === 'pending' || i.status === 'downloading');
  if (live.length === 0) {
    console.log('Cola sin pendientes ni descargas activas. Nada que revisar.');
    return;
  }
  console.log('=== SALUD DE ENLACES FIRMADOS (aria2c) ===\n');
  let worst = Infinity;
  for (const it of live) {
    // Descargando = primer salto superado (aria2 sigue la redirección 302 a la
    // URL de 24h). El `expiration` de la URL original ya no aplica: no alarmar.
    if (it.status === 'downloading') {
      console.log(`▶️  en curso (transfiriendo) | [downloading] ${it.name}`);
      continue;
    }
    const exp = expiryOf(it.url);
    if (!exp || Number.isNaN(exp.getTime())) {
      console.log(`?  sin expiración detectable | [${it.status}] ${it.name}`);
      continue;
    }
    const hoursLeft = (exp.getTime() - now) / 3600000;
    worst = Math.min(worst, hoursLeft);
    const icon = hoursLeft < 0 ? '❌ EXPIRADO' : hoursLeft < 6 ? '⚠️  <6h' : '✅';
    console.log(`${icon} | expira ${exp.toISOString()} (${hoursLeft.toFixed(1)}h) | [${it.status}] ${it.name}`);
    if (hoursLeft < 0) {
      console.log(`   → regenerar desde la página dlpsgame y actualizar la URL en la cola.`);
    }
  }
  console.log(`\nPeor caso: ${worst === Infinity ? 'sin datos' : `${worst.toFixed(1)}h restantes`}.`);
  if (worst < 6) process.exitCode = 2;
}

main();
