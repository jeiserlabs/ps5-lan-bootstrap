#!/usr/bin/env node
/**
 * @file status.js
 * @description Estado unificado del pipeline PS5 en un solo comando: consola (elfldr +
 *   pkg-receiver), IDM/aria, cola de descargas, daemons vivos y biblioteca de PKGs.
 *   Reemplaza a los ~140 scripts sueltos del scratch de Antigravity.
 * Uso: node scripts/ps5/status.js [--json]
 * SRP < 300L.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { getPs5Config } = require('../lib/config.js');
const queueState = require('../lib/queue_state.js');
const { readAlivePid } = require('../lib/pidfile.js');
const { loadInstalledList } = require('../lib/installed_store.js');

const cfg = getPs5Config();

/**
 * @param {string} url
 * @param {number} timeoutMs
 * @returns {Promise<{ status: number, body: string } | null>}
 */
function httpGet(url, timeoutMs) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

/**
 * @param {string} host
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function tcpProbe(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('timeout', () => done(false));
    socket.on('error', () => done(false));
  });
}

/**
 * @param {string} dir
 * @param {Set<string>} ext
 * @param {number} depth
 * @param {string[]} out
 */
function walkFiles(dir, ext, depth, out) {
  if (depth < 0) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, ext, depth - 1, out);
    else if (ext.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
}

function ariaState() {
  const queueFile = path.join(cfg.state.cacheDir, 'queue_state.json');
  let downloading = null;
  let pending = 0;
  try {
    const q = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
    for (const it of q.items || []) {
      if (it.status === 'downloading') downloading = it.name;
      if (it.status === 'pending') pending += 1;
    }
  } catch {}
  let stagingBytes = 0;
  try {
    for (const f of fs.readdirSync(cfg.paths.stagingDir)) {
      try { stagingBytes += fs.statSync(path.join(cfg.paths.stagingDir, f)).size; } catch {}
    }
  } catch {}
  return { active: Boolean(downloading), downloading, pending, stagingBytes };
}

async function collect() {
  const ps5Elfldr = await tcpProbe(cfg.ps5.ip, cfg.ps5.elfldrPort, 2000);
  const statusRes = await httpGet(`http://${cfg.ps5.ip}:${cfg.ps5.installPort}/api/status`, 3000);
  let install = null;
  if (statusRes) {
    try {
      install = JSON.parse(statusRes.body);
    } catch {
      install = null;
    }
  }
  const serverRes = await httpGet(`http://${cfg.ps5.pcIp}:${cfg.ps5.serverPort}/healthz`, 2500);

  const aria = ariaState();
  const archives = [];
  const failed = [];
  for (const dir of (cfg.paths.watchDirs || [cfg.paths.watchDir])) {
    walkFiles(dir, new Set(['.rar', '.zip']), 1, archives);
    walkFiles(dir, new Set(['.failed']), 1, failed);
  }
  const pkgs = [];
  for (const dir of cfg.paths.libraryDirs) walkFiles(dir, new Set(['.pkg']), 3, pkgs);

  const state = queueState.loadState(path.join(cfg.state.cacheDir, 'queue_state.json'));
  const installedFile = path.join(cfg.state.cacheDir, 'installed_pkgs.json');
  const installedCount = loadInstalledList(installedFile).length;

  const daemons = {
    aria_pilot: readAlivePid(path.join(cfg.state.cacheDir, 'aria_pilot.pid')),
    daemon: readAlivePid(path.join(cfg.state.cacheDir, 'daemon.pid')),
    server: readAlivePid(path.join(cfg.state.cacheDir, 'server.pid')),
  };

  return {
    ps5: {
      ip: cfg.ps5.ip,
      elfldr: ps5Elfldr,
      install: install ? { busy: install.busy, active: install.active, pull: install.pull, pullName: install.pullName || '' } : null,
      serverLan: Boolean(serverRes),
    },
    aria,
    archives: { pending: archives.length - failed.length, failed: failed.length },
    library: { pkgCount: pkgs.length },
    queue: queueState.summarize(state),
    installedCount,
    daemons,
  };
}

function printReport(data) {
  const line = '='.repeat(64);
  console.log(line);
  console.log('🎮 PIPELINE PS5 — ESTADO UNIFICADO');
  console.log(line);
  const ps5 = data.ps5;
  console.log(`Consola ${ps5.ip}: elfldr ${ps5.elfldr ? '✅ vivo' : '❌ no responde'} | pkg-receiver ${
    ps5.install ? `✅ ${ps5.install.busy ? 'OCUPADA' : 'idle'}${ps5.install.pull ? ' (recibiendo)' : ''}` : '❌ no responde'
  }`);
  console.log(`Servidor LAN 9898: ${ps5.serverLan ? '✅ activo' : '❌ caído (npm run ps5:server)'}`);
  console.log(`aria2c: ${data.aria.active ? `⬇️  descargando: ${data.aria.downloading}` : '💤 libre'} | pendientes: ${data.aria.pending} | staging: ${(data.aria.stagingBytes / 1e9).toFixed(2)} GB`);
  console.log(`Descargas pendientes en Desktop: ${data.archives.pending} archivo(s) | fallidas: ${data.archives.failed}`);
  console.log(`Biblioteca: ${data.library.pkgCount} PKG(s) | instalados registrados: ${data.installedCount}`);
  console.log(line);
  const q = data.queue;
  console.log(`Cola: ${q.total} items | pendientes ${q.pending} | en curso ${q.injected} | completados ${q.completed} | fallidos ${q.failed} | saltados ${q.skipped}`);
  if (q.next) console.log(`Siguiente: ${q.next}`);
  console.log(line);
  console.log(`Daemons: aria_pilot ${data.daemons.aria_pilot ? `✅ pid ${data.daemons.aria_pilot}` : '⏸️  apagado'} | daemon ${data.daemons.daemon ? `✅ pid ${data.daemons.daemon}` : '⏸️  apagado'} | server ${data.daemons.server ? `✅ pid ${data.daemons.server}` : '⏸️  apagado'}`);
  console.log(line);
}

async function main() {
  const data = await collect();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  printReport(data);
}

main().catch((err) => {
  console.error(`[PS5 STATUS] ERROR: ${err.message}`);
  process.exit(1);
});
