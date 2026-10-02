#!/usr/bin/env node
/**
 * @file status.js
 * @description Estado unificado del pipeline PS5 en un solo comando: consola (elfldr +
 *   pkg-receiver), IDM, cola de descargas, daemons vivos y biblioteca de PKGs.
 *   Reemplaza a los ~140 scripts sueltos del scratch de Antigravity.
 * Uso: node scripts/ps5/status.js [--json]
 * SRP < 300L.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const { getPs5Config } = require('../../lib/ps5/config.js');
const queueState = require('../../lib/ps5/queue_state.js');
const { readAlivePid } = require('../../lib/ps5/pidfile.js');

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

function idmState() {
  const root = cfg.paths.idmDataDir;
  if (!fs.existsSync(root)) return { active: false, dirs: [] };
  const dirs = [];
  let active = false;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(root, entry.name);
    let maxMtime = 0;
    let bytes = 0;
    for (const file of fs.readdirSync(dirPath)) {
      if (file.endsWith('.log')) continue;
      try {
        const stat = fs.statSync(path.join(dirPath, file));
        maxMtime = Math.max(maxMtime, stat.mtimeMs);
        bytes += stat.size;
      } catch {
        // archivo rotado
      }
    }
    if (Date.now() - maxMtime < cfg.queue.idmActiveWindowMs) active = true;
    dirs.push({ name: entry.name, bytes, lastMs: maxMtime });
  }
  return { active, dirs };
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

  const idm = idmState();
  const archives = [];
  walkFiles(cfg.paths.watchDir, new Set(['.rar', '.zip']), 1, archives);
  const failed = archives.filter((f) => f.endsWith('.failed'));
  const pkgs = [];
  for (const dir of cfg.paths.libraryDirs) walkFiles(dir, new Set(['.pkg']), 3, pkgs);

  const state = queueState.loadState(path.join(cfg.state.cacheDir, 'queue_state.json'));
  const installedFile = path.join(cfg.state.cacheDir, 'installed_pkgs.json');
  let installedCount = 0;
  try {
    installedCount = JSON.parse(fs.readFileSync(installedFile, 'utf8')).length;
  } catch {
    installedCount = 0;
  }

  const daemons = {
    sequencer: readAlivePid(path.join(cfg.state.cacheDir, 'sequencer.pid')),
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
    idm,
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
  console.log(`IDM: ${data.idm.active ? '⬇️  descargando' : '💤 libre'}`);
  for (const dir of data.idm.dirs) {
    console.log(`  - ${dir.name}: ${(dir.bytes / 1e9).toFixed(2)} GB en fragmentos`);
  }
  console.log(`Descargas pendientes en Desktop: ${data.archives.pending} archivo(s) | fallidas: ${data.archives.failed}`);
  console.log(`Biblioteca: ${data.library.pkgCount} PKG(s) | instalados registrados: ${data.installedCount}`);
  console.log(line);
  const q = data.queue;
  console.log(`Cola: ${q.total} items | pendientes ${q.pending} | en curso ${q.injected} | completados ${q.completed} | fallidos ${q.failed} | saltados ${q.skipped}`);
  if (q.next) console.log(`Siguiente: ${q.next}`);
  console.log(line);
  console.log(`Daemons: sequencer ${data.daemons.sequencer ? `✅ pid ${data.daemons.sequencer}` : '⏸️  apagado'} | daemon ${data.daemons.daemon ? `✅ pid ${data.daemons.daemon}` : '⏸️  apagado'} | server ${data.daemons.server ? `✅ pid ${data.daemons.server}` : '⏸️  apagado'}`);
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
