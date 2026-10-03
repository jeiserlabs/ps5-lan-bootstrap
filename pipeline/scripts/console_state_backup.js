#!/usr/bin/env node
/**
 * @file console_state_backup.js
 * @description BLINDAJE: snapshot read-only del estado dorado de la consola.
 *   Baja por HTTP (Payload Manager) y FTP (ftpsrv) TODA la configuración que hace
 *   funcionar el jailbreak y la guarda localmente con hashes SHA256:
 *     - config del Payload Manager + cadena de autoload + estado
 *     - /data/pldmgr/autoload.txt (copia exacta)
 *     - /data/shadowmount/config.ini (copia exacta, el fix kstuff_game_auto_toggle=0)
 *     - listado de /data/ps5_autoloader/ (debe estar SIN autoload.txt)
 *     - los 5 payloads EN la consola (bytes exactos) con SHA256 vs copia local
 *   NUNCA escribe en la consola. Restaurar es manual: ver RESTORE_NOTES.md generado.
 * Uso: node pipeline/scripts/console_state_backup.js [--out <dir>]
 * SRP < 300L. Cero dependencias externas (curl del sistema para FTP).
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { getPs5Config } = require('../lib/config.js');
const { logPs5 } = require('../lib/pipeline_log.js');

const execFileP = promisify(execFile);
const cfg = getPs5Config();
const TAG = 'CONSOLE_BACKUP';
const ROOT = path.resolve(__dirname, '..', '..');
const PMGR = `http://${cfg.ps5.ip}:8084`;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function httpGet(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

async function ftpGet(url, outFile) {
  try {
    await execFileP('curl', ['-s', '-m', '30', '--ftp-pasv', url, '-o', outFile], { windowsHide: true });
    return fs.existsSync(outFile) && fs.statSync(outFile).size > 0;
  } catch {
    return false;
  }
}

async function ftpList(url) {
  try {
    const { stdout } = await execFileP('curl', ['-s', '-m', '20', '--ftp-pasv', url], { windowsHide: true, maxBuffer: 1 << 20 });
    return stdout;
  } catch {
    return '';
  }
}

async function main() {
  const log = (m) => logPs5(TAG, m, cfg.state.logFile);
  const outIdx = process.argv.indexOf('--out');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = outIdx >= 0 ? path.resolve(process.argv[outIdx + 1]) : path.join(ROOT, 'data', 'backups', 'console_state', stamp);
  fs.mkdirSync(path.join(outDir, 'payloads_console'), { recursive: true });

  // 1) Payload Manager (HTTP, read-only)
  const manifest = { timestamp: new Date().toISOString(), console_ip: cfg.ps5.ip, pmgr: {}, files: {} };
  for (const ep of ['version', 'get_config', 'autoload_status', 'list_payloads']) {
    const res = await httpGet(`${PMGR}/${ep}`);
    manifest.pmgr[ep] = res && res.status === 200 ? safeJson(res.body) : `UNREACHABLE (status ${res ? res.status : 'null'})`;
  }

  // 2) Copias exactas por FTP
  const ftpJobs = [
    ['ftp://192.168.2.2:2121/data/pldmgr/autoload.txt', 'autoload.txt'],
    ['ftp://192.168.2.2:2121/data/shadowmount/config.ini', 'shadowmount_config.ini'],
  ];
  for (const [url, name] of ftpJobs) {
    const dst = path.join(outDir, name);
    manifest.files[name] = (await ftpGet(url.replace('192.168.2.2', cfg.ps5.ip), dst)) ? { saved: true, sha256: sha256(dst) } : { saved: false };
  }
  manifest.files.ps5_autoloader_listing = { content: await ftpList(`ftp://${cfg.ps5.ip}:2121/data/ps5_autoloader/`) };

  // 3) Payloads EN la consola (bytes exactos) + comparación con payloads/ del repo
  const consolePayloads = Array.isArray(manifest.pmgr.list_payloads && manifest.pmgr.list_payloads.payloads)
    ? manifest.pmgr.list_payloads.payloads : [];
  for (const remotePath of consolePayloads) {
    const name = path.posix.basename(remotePath);
    const dst = path.join(outDir, 'payloads_console', name);
    const ok = await ftpGet(`ftp://${cfg.ps5.ip}:2121${remotePath}`, dst);
    const entry = { remote_path: remotePath, saved: ok };
    if (ok) {
      entry.sha256_console = sha256(dst);
      const local = path.join(ROOT, 'payloads', name);
      if (fs.existsSync(local)) {
        entry.sha256_repo = sha256(local);
        entry.matches_repo = entry.sha256_repo === entry.sha256_console;
      }
    }
    manifest.files[`payload:${name}`] = entry;
  }

  // 4) Hashes de payloads/ local sin copia en consola (informativo)
  const localDir = path.join(ROOT, 'payloads');
  manifest.repo_payloads_not_on_console = fs.existsSync(localDir)
    ? fs.readdirSync(localDir).filter((f) => f.endsWith('.elf') && !consolePayloads.some((p) => p.endsWith(f)))
    : [];

  // 5) RESTORE_NOTES.md (el manual de reconstrucción de ESTA snapshot)
  const chain = manifest.pmgr.get_config && manifest.pmgr.get_config.AUTOLOAD_LIST
    ? manifest.pmgr.get_config.AUTOLOAD_LIST : CANONICAL_FALLBACK;
  const notes = [
    '# RESTORE NOTES (snapshot read-only — nada aquí escribe en la consola)',
    `Consola: ${cfg.ps5.ip} · Snapshot: ${manifest.timestamp}`,
    '',
    '## Restaurar cadena de autoload (Payload Manager)',
    '```',
    `curl -X POST -H "Content-Type: application/json" -d '{"AUTOLOAD_LIST":"${chain}"}' http://${cfg.ps5.ip}:8084/set_config`,
    '```',
    '',
    '## Re-subir un payload (si falta o cambió su hash)',
    '```',
    `curl -X POST --data-binary @payloads_console/<archivo.elf> "http://${cfg.ps5.ip}:8084/manage:upload?filename=<archivo.elf>"`,
    '```',
    '',
    '## Relanzar payloads en caliente (sin reboot)',
    '```',
    ...consolePayloads.map((p) => `curl "http://${cfg.ps5.ip}:8084/loadpayload:${p}"`),
    '```',
    '',
    '## Restaurar config.ini de ShadowMountPlus (fix kstuff_game_auto_toggle=0)',
    '```',
    `curl -T shadowmount_config.ini "ftp://${cfg.ps5.ip}:2121/data/shadowmount/config.ini"`,
    '```',
    '',
    '## Si la app WKAL00001 se borró de la consola (con jailbreak activo)',
    '```',
    'node pipeline/scripts/send_elf.js ps5-host/webkit-autoloader-installer_v0.5.2.elf',
    '# → reiniciar la consola 1 vez → abrir "WebKit Autoloader"',
    '```',
    '',
    '## Si la página cacheada del navegador se borró',
    'Host DNS+HTTPS en la PC (tarea PS5_PC_Pipeline) → PS5 con DNS manual 192.168.2.1 →',
    'Ajustes > Guía y avisos > Guía del usuario. NUNCA borrar datos del navegador.',
    '',
    'Guía completa de reconstrucción desde cero: BLINDADO_RESTAURACION_PS5.md (raíz del repo).',
  ].join('\n');
  fs.writeFileSync(path.join(outDir, 'RESTORE_NOTES.md'), notes + '\n');
  fs.writeFileSync(path.join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');

  const saved = Object.entries(manifest.files).filter(([, v]) => v.saved !== false).length;
  log(`Snapshot dorado en ${outDir} (${saved} archivos, ${consolePayloads.length} payloads).`);
  console.log(`✅ Snapshot: ${outDir}`);
  console.log(`   PMGR ${manifest.pmgr.version} · payloads en consola: ${consolePayloads.length}`);
  for (const [k, v] of Object.entries(manifest.files)) {
    if (k.startsWith('payload:') && v.saved) console.log(`   ${k.slice(8)}: ${v.matches_repo === false ? '⚠️ DIFIERE del repo' : 'hash ok'}`);
    else if (v.saved === false) console.log(`   ${k}: ❌ NO guardado`);
  }
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return String(text); }
}

const CANONICAL_FALLBACK = 'kstuff.elf,elfldr-ps5.elf,pkg-receiver.elf,ftpsrv-ps5.elf,shadowmountplus.elf';

main().catch((e) => {
  logPs5(TAG, `Fatal: ${e && e.message}`, cfg.state.logFile);
  console.error(`ERROR: ${e && e.message}`);
  process.exitCode = 1;
});
