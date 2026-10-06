#!/usr/bin/env node
/**
 * @file seed_aria_profile.js
 * @description Siembra el perfil Brave de automatización (una vez, navegador VISIBLE).
 *   Abre una página AkiraBox, espera el timer + Turnstile (clic manual si lo pide),
 *   y verifica que el botón de descarga se habilite. La clearance queda guardada
 *   en E:\ps5\data\browser_profiles\brave_aria_profile para los runs headless.
 * Uso: node pipeline/scripts/seed_aria_profile.js [page-url]
 * SRP < 120L.
 */
'use strict';

const { resolveAkiraBox } = require('../lib/akira_resolver.js');

async function main() {
  const pageUrl = process.argv[2] || 'https://akirabox.to/gXeGOWnPGAa7/file';
  console.log('=== SEED perfil Brave automatización (navegador VISIBLE) ===');
  console.log(`Página: ${pageUrl}`);
  console.log('Si Cloudflare pide clic en el checkbox, hazlo en la ventana que se abre.');
  // headed=true: NO cancela el download, solo verifica habilitación.
  // resolveAkiraBox hace clic y cancela el download capturando solo la URL.
  const res = await resolveAkiraBox(pageUrl, null, true);
  if (res.ok) {
    console.log('✅ SEED OK: botón habilitado, URL firmada capturada.');
    console.log(`   ${res.directUrl.substring(0, 90)}...`);
    console.log('El perfil quedó con clearance. Los runs headless ya pueden resolver solos.');
  } else {
    console.log(`❌ SEED FALLÓ: ${res.error}`);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error(`FATAL: ${e.message}`); process.exit(1); });
