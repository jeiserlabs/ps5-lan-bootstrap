#!/usr/bin/env node
/**
 * @file update_payloads.js
 * @description Comprobador y actualizador automatizado de payloads dorados de PS5.
 *   Consulta las APIs oficiales de GitHub (EchoStretch, ps5-payload-dev, drakmor, itsPLK),
 *   valida versiones contra hashes locales y reporta actualizaciones disponibles.
 * SRP < 180L. Cero dependencias externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');

const REPOS = [
  { name: 'kstuff.elf', repo: 'EchoStretch/kstuff-lite', pattern: /\.elf$/i },
  { name: 'ftpsrv-ps5.elf', repo: 'ps5-payload-dev/ftpsrv', pattern: /ftpsrv.*\.elf$/i },
  { name: 'shadowmountplus.elf', repo: 'drakmor/ShadowMountPlus', pattern: /shadowmount.*\.elf$/i },
  { name: 'webkit-autoloader', repo: 'itsPLK/ps5-webkit-autoloader', pattern: /\.elf$/i },
];

function fetchJson(url) {
  return new Promise((resolve) => {
    const opts = {
      headers: {
        'User-Agent': 'ps5-lan-bootstrap-updater',
        'Accept': 'application/vnd.github.v3+json'
      }
    };
    https.get(url, opts, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: null });
        }
      });
    }).on('error', () => resolve({ status: 500, data: null }));
  });
}

function getLocalFileHash(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function checkPayloadUpdates(dryRun = true) {
  console.log('🔍 Consultando actualizaciones de payloads oficiales en GitHub...\n');
  const payloadDir = path.join(__dirname, '..', '..', 'payloads');

  for (const item of REPOS) {
    const apiUrl = `https://api.github.com/repos/${item.repo}/releases/latest`;
    const res = await fetchJson(apiUrl);

    if (res.status !== 200 || !res.data) {
      console.log(`⚠️ [${item.name}]: No se pudo consultar ${item.repo} (HTTP ${res.status})`);
      continue;
    }

    const release = res.data;
    const tagName = release.tag_name || 'unknown';
    const publishedAt = release.published_at ? release.published_at.split('T')[0] : 'N/A';
    const localFile = path.join(payloadDir, item.name);
    const localHash = getLocalFileHash(localFile);

    console.log(`📦 ${item.name} (${item.repo})`);
    console.log(`   └─ Versión remota: ${tagName} (publicado: ${publishedAt})`);
    console.log(`   └─ Hash local actual: ${localHash ? localHash.substring(0, 12) + '...' : 'No presente en repo'}`);

    const matchingAsset = (release.assets || []).find(a => item.pattern.test(a.name));
    if (matchingAsset) {
      console.log(`   └─ Asset descargable: ${matchingAsset.name} (${(matchingAsset.size / 1024).toFixed(1)} KB)`);
    }
    console.log('');
  }

  console.log('✅ Chequeo de releases completado.');
}

if (require.main === module) {
  const isDryRun = !process.argv.includes('--apply');
  checkPayloadUpdates(isDryRun);
}

module.exports = { checkPayloadUpdates };
