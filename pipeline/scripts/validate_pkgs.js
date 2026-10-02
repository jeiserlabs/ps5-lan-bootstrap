#!/usr/bin/env node
/**
 * @file validate_pkgs.js
 * @description CLI de auditoría forense para validar PKGs antes de cualquier instalación.
 * Uso: node scripts/validate_pkgs.js [directorio o archivo.pkg]
 * SRP < 300L.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { validatePkg } = require('../lib/pkg_validator.js');

function walkPkgs(targetPath, out = []) {
  if (!fs.existsSync(targetPath)) return out;
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    if (targetPath.toLowerCase().endsWith('.pkg')) out.push(targetPath);
    return out;
  }
  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    const full = path.join(targetPath, entry.name);
    if (entry.isDirectory()) walkPkgs(full, out);
    else if (entry.name.toLowerCase().endsWith('.pkg')) out.push(full);
  }
  return out;
}

function main() {
  const args = process.argv.slice(2);
  const targets = args.length > 0 ? args : ['E:\\Biblioteca_Juegos_PS', 'C:\\Biblioteca_Juegos_PS'];

  console.log('========================================================================');
  console.log(' 🛡️  AUDITORÍA FORENSE DE INTEGRIDAD PKG (CERO TOLERANCIA A ERRORES)');
  console.log('========================================================================\n');

  let totalFiles = 0;
  let passedCount = 0;
  let failedCount = 0;

  for (const target of targets) {
    if (!fs.existsSync(target)) continue;
    const pkgs = walkPkgs(target);
    if (pkgs.length === 0) continue;

    console.log(`📁 Directorio: ${target} (${pkgs.length} PKGs encontrados)\n`);

    for (const pkgPath of pkgs) {
      totalFiles++;
      const res = validatePkg(pkgPath);
      const sizeGb = (res.info.sizeBytes / (1024 ** 3)).toFixed(2);

      if (res.valid) {
        passedCount++;
        console.log(`✅ [APROBADO] ${res.info.titleId} v${res.info.appVer} [${res.info.category}] — ${res.info.title} (${sizeGb} GB)`);
        console.log(`   └─ Archivo: ${res.info.file}`);
      } else {
        failedCount++;
        console.log(`❌ [RECHAZADO] ${res.info.file} (${sizeGb} GB)`);
        for (const err of res.errors) {
          console.log(`   └─ ERROR: ${err}`);
        }
      }
      if (res.warnings.length > 0) {
        for (const w of res.warnings) {
          console.log(`   └─ AVISO: ${w}`);
        }
      }
      console.log('');
    }
  }

  console.log('------------------------------------------------------------------------');
  console.log(`📊 RESUMEN FINAL: ${totalFiles} PKGs auditados | ✅ ${passedCount} Aprobados | ❌ ${failedCount} Rechazados`);
  console.log('------------------------------------------------------------------------');

  if (failedCount > 0) {
    process.exit(1);
  }
}

main();
