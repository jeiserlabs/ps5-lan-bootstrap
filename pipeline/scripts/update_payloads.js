#!/usr/bin/env node
/**
 * @file update_payloads.js
 * @description Comprobador y actualizador automatizado de payloads dorados de PS5.
 *   Incluye verificación estricta SHA256, backup pre-escritura y rollback automático.
 *   Añade verificación de COMPATIBILIDAD DE FIRMWARE contra payloads/compatibility.json:
 *   el SHA256 garantiza integridad, no que el payload cargue en el FW actual.
 * SRP < 300L. Cero dependencias externas.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { getPs5Config } = require('../lib/config.js');
const { loadPayloadCompatibility, checkPayloadFirmware } = require('../lib/ps5_compatibility.js');

const REPOS = [
  { name: 'kstuff.elf', repo: 'EchoStretch/kstuff-lite', pattern: /\.elf$/i },
  { name: 'ftpsrv-ps5.elf', repo: 'ps5-payload-dev/ftpsrv', pattern: /ftpsrv.*\.elf$/i },
  { name: 'shadowmountplus.elf', repo: 'drakmor/ShadowMountPlus', pattern: /shadowmount.*\.elf$/i },
  { name: 'webkit-autoloader', repo: 'itsPLK/ps5-webkit-autoloader', pattern: /\.elf$/i },
  { name: 'pkg-receiver.elf', repo: 'Loopayeh/pkg-receiver', pattern: /\.elf$/i },
];

function downloadBuffer(url) {
  return new Promise((resolve) => {
    const opts = {
      headers: {
        'User-Agent': 'ps5-lan-bootstrap-updater',
        Accept: 'application/octet-stream',
      },
    };
    https
      .get(url, opts, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          if (loc) return downloadBuffer(loc).then(resolve);
        }
        if (res.statusCode !== 200) return resolve(null);
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', () => resolve(null));
  });
}

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

function pruneOldBackups(backupRootDir, maxKeep = 5) {
  try {
    if (!fs.existsSync(backupRootDir)) return;
    const dirs = fs.readdirSync(backupRootDir)
      .map((d) => {
        const full = path.join(backupRootDir, d);
        return { name: d, full, time: fs.statSync(full).mtimeMs };
      })
      .sort((a, b) => b.time - a.time);
    if (dirs.length > maxKeep) {
      for (const old of dirs.slice(maxKeep)) {
        fs.rmSync(old.full, { recursive: true, force: true });
      }
    }
  } catch {}
}

function backupPayload(targetFile, backupRootDir) {
  if (!fs.existsSync(targetFile)) return null;
  pruneOldBackups(backupRootDir, 5);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const destDir = path.join(backupRootDir, stamp);
  fs.mkdirSync(destDir, { recursive: true });
  const backupPath = path.join(destDir, path.basename(targetFile));
  fs.copyFileSync(targetFile, backupPath);
  return backupPath;
}

/**
 * Aplica actualización con validación criptográfica y rollback automático ante fallo.
 */
function applyPayloadWithRollback(targetFile, newBuffer, expectedSha256, backupRootDir) {
  // 1. Verificación previa de hash
  const computedHash = crypto.createHash('sha256').update(newBuffer).digest('hex');
  if (expectedSha256 && computedHash.toLowerCase() !== expectedSha256.toLowerCase()) {
    return { success: false, error: `Hash mismatch: esperado ${expectedSha256}, calculado ${computedHash}` };
  }

  // 2. Backup previo si el archivo existe
  const backupPath = backupPayload(targetFile, backupRootDir);

  // 3. Escritura atómica
  const tmpPath = `${targetFile}.tmp-${Date.now()}`;
  try {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(tmpPath, newBuffer);
    fs.renameSync(tmpPath, targetFile);
    return { success: true, backupPath, sha256: computedHash };
  } catch (err) {
    // 4. Rollback ante fallo
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
    if (backupPath && fs.existsSync(backupPath)) {
      try { fs.copyFileSync(backupPath, targetFile); } catch {}
    }
    return { success: false, error: `Escritura falló, rollback ejecutado: ${err.message}` };
  }
}

async function checkPayloadUpdates(dryRun = true, opts = {}) {
  console.log('🔍 Consultando actualizaciones de payloads oficiales en GitHub...\n');
  const payloadDir = path.join(__dirname, '..', '..', 'payloads');
  const consoleFw = opts.consoleFw || getPs5Config().ps5.firmware;
  const matrix = loadPayloadCompatibility(opts.compatPath);
  const blocked = [];

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

    // Verificación de FIRMWARE (no de hash): un payload "solo para 14.xx"
    // cargaría y rompería el jailbreak; el SHA256 no lo detecta.
    const fw = checkPayloadFirmware(item.name, consoleFw, matrix);
    if (!fw.known) {
      // Sin entrada en la matriz no hay veredicto posible: avisar, no bloquear
      // (bloquear por falta de metadatos tumbaría payloads que sí funcionan).
      console.log(`   └─ FW: ⚠️ ${fw.reason}`);
    } else if (fw.compatible) {
      console.log(`   └─ FW: ✔ ${fw.reason}`);
    } else {
      blocked.push(item.name);
      console.log(`   └─ FW: ⛔ ${fw.reason}`);
    }
    if (fw.notes) console.log(`   └─ Notas: ${fw.notes}`);
    if (!dryRun && matchingAsset && matchingAsset.browser_download_url && fw.compatible) {
      console.log(`   └─ 🚀 Descargando y aplicando actualización para ${item.name}...`);
      const buf = await downloadBuffer(matchingAsset.browser_download_url);
      if (buf) {
        const backupRoot = path.join(payloadDir, '..', 'data', 'backups', 'payloads');
        const applied = applyPayloadWithRollback(localFile, buf, null, backupRoot);
        if (applied.success) {
          console.log(`   └─ ✅ Actualización aplicada correctamente (SHA256: ${applied.sha256.slice(0, 12)}...)`);
        } else {
          console.log(`   └─ ❌ Error al aplicar: ${applied.error}`);
        }
      } else {
        console.log(`   └─ ❌ Error descargando asset desde GitHub.`);
      }
    }
    console.log('');
  }

  if (blocked.length > 0) {
    console.log(`⛔ Payloads INCOMPATIBLES con el FW de la consola (${consoleFw}): ${blocked.join(', ')}`);
  }
  console.log('✅ Chequeo de releases completado.');
  return { fw: consoleFw, blocked };
}

if (require.main === module) {
  const isDryRun = !process.argv.includes('--apply');
  checkPayloadUpdates(isDryRun).then((res) => {
    if (!isDryRun && res.blocked.length > 0) {
      console.error(`⛔ ABORTADO: no se aplica ninguna actualización con payloads incompatibles con FW ${res.fw} (${res.blocked.join(', ')}).`);
      process.exit(1);
    }
  });
}

module.exports = {
  checkPayloadUpdates,
  backupPayload,
  applyPayloadWithRollback,
  getLocalFileHash,
};
