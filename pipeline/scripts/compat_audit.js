#!/usr/bin/env node
/**
 * @file compat_audit.js
 * @description Cruza el filtro de compatibilidad con el LEDGER REAL de instalaciones
 *   (`data/logs/lan_installer.log`). Sirve para regenerar/verificar la lista de
 *   bloqueos con datos en vez de con reportes de foros sin verificar.
 * Uso: node pipeline/scripts/compat_audit.js
 * SRP < 150L. Cero dependencias externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { getPs5Config } = require('../lib/config.js');
const { parseStallEvidence, parseSuccessEvidence, checkCompatibility, contradictedSceneReports, groupStalls } = require('../lib/ps5_compatibility.js');

const REENTRANCY_BAND = 64 * 1024 ** 2; // ±64 MB alrededor de ~3.3 GB = bug de ciclos solapados
const fmt = (bytes) => `${(bytes / 1e9).toFixed(2)} GB`;

function main() {
  const cfg = getPs5Config();
  const logFile = path.join(path.dirname(cfg.state.logFile), 'lan_installer.log');
  const text = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8') : '';
  const stalls = parseStallEvidence(text);
  const successes = new Set(parseSuccessEvidence(text));

  console.log('========================================================================');
  console.log(' 🧪 FILTRO DE COMPATIBILIDAD vs LEDGER REAL (lan_installer.log)');
  console.log(`    Consola: FW ${cfg.ps5.firmware} · ${logFile}`);
  console.log('========================================================================\n');

  const ids = [...new Set([...Object.keys(stalls), ...successes, ...contradictedSceneReports()])].sort();
  const alerts = [];
  for (const id of ids) {
    const stall = stalls[id] || { count: 0, bytes: [], byte: null, deterministic: false };
    const compat = checkCompatibility(id);
    const ok = successes.has(id) ? 'sí' : 'no';
    console.log(`[${id}] ${compat.titleId === id ? '' : '(no es un CUSA válido)'}`);
    console.log(`   ledger: ${stall.count} estancamiento(s) | determinista: ${stall.deterministic ? 'SÍ' : 'no'} | instalado OK: ${ok}`);
    for (const cluster of groupStalls(stall.bytes).slice(0, 4)) {
      const band = Math.abs(cluster.byte - 3.3e9) <= REENTRANCY_BAND
        ? ' ⚠️ bug de reentrancia del daemon (no es el título)'
        : ' ← candidato a rechazo del cliente';
      console.log(`      - ${fmt(cluster.byte)} ×${cluster.count}${band}`);
    }
    if (stall.deterministic && successes.has(id)) {
      console.log('   lectura: el determinismo de este título viene de ciclos solapados; NO es rechazo del cliente.');
    }
    console.log(`   veredicto: ${compat.severity.toUpperCase()} — ${compat.reason}`);
    if (compat.sceneReport) {
      console.log(`   foro: "${compat.sceneReport.issue}" (localAudit=${compat.sceneReport.localAudit})`);
    }
    // Contradicción peligrosa: se instaló OK pero el filtro lo bloquea.
    if (successes.has(id) && !compat.compatible) {
      alerts.push(`${id} se instaló correctamente en esta consola pero el filtro lo BLOQUEA`);
    }
    console.log('');
  }

  console.log('------------------------------------------------------------------------');
  if (alerts.length > 0) {
    for (const a of alerts) console.log(`⚠️  CONTRADICCIÓN: ${a}`);
    console.log('------------------------------------------------------------------------');
    process.exit(1);
  }
  console.log('✅ Filtro coherente con el ledger: ningún título instalado con éxito está bloqueado.');
  console.log('------------------------------------------------------------------------');
}

if (require.main === module) {
  main();
}

module.exports = { main };
