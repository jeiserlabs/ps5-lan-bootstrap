#!/usr/bin/env node
/**
 * @file server.js
 * @description Servidor LAN multi-disco de PKGs para la PS5 (http://PC:9898/pkg/<archivo>),
 *   con streaming y soporte de cabeceras Range para transferencias grandes.
 *   Endurecido: resolución exacta primero (sin servir un archivo parecido por error),
 *   /healthz para el daemon y pidfile para evitar instancias duplicadas.
 * Uso: node scripts/ps5/server.js [--port 9898]
 * SRP < 300L.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { getPs5Config } = require('../lib/config.js');
const { logPs5 } = require('../lib/pipeline_log.js');
const { acquirePid, releasePid } = require('../lib/pidfile.js');

const cfg = getPs5Config();
const TAG = 'SERVER';
const portArgIdx = process.argv.indexOf('--port');
const PORT = portArgIdx >= 0 ? Number(process.argv[portArgIdx + 1]) : cfg.ps5.serverPort;
const PID_FILE = path.join(cfg.state.cacheDir, 'server.pid');

/**
 * Búsqueda difusa recursiva (fallback con aviso).
 * @param {string} dir
 * @param {string} target
 * @param {number} depth
 * @returns {string|null}
 */
function fuzzyFind(dir, target, depth) {
  if (depth < 0) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = fuzzyFind(full, target, depth - 1);
      if (found) return found;
    } else if (entry.name.toLowerCase().includes(target.toLowerCase())) {
      return full;
    }
  }
  return null;
}

/** @type {Map<string, { filePath: string, fuzzy: boolean }>} */
const pkgPathCache = new Map();

/**
 * @param {string} filename
 * @returns {{ filePath: string, fuzzy: boolean } | null}
 */
function resolvePkg(filename) {
  if (pkgPathCache.has(filename)) {
    return pkgPathCache.get(filename);
  }
  for (const dir of cfg.paths.libraryDirs) {
    const exact = path.join(dir, filename);
    try {
      if (fs.existsSync(exact) && !fs.statSync(exact).isDirectory()) {
        const res = { filePath: exact, fuzzy: false };
        pkgPathCache.set(filename, res);
        return res;
      }
    } catch {
      // directorio inaccesible: se continúa
    }
  }
  for (const dir of cfg.paths.libraryDirs) {
    const found = fuzzyFind(dir, filename, 3);
    if (found) {
      const res = { filePath: found, fuzzy: true };
      pkgPathCache.set(filename, res);
      return res;
    }
  }
  return null;
}

/** @type {Map<string, number>} */
const lastLogByFile = new Map();
/**
 * @param {string} filename
 * @param {string} message
 */
function logThrottled(filename, message) {
  const now = Date.now();
  if ((lastLogByFile.get(filename) || 0) > now - 10000) return;
  lastLogByFile.set(filename, now);
  logPs5(TAG, message, cfg.state.logFile);
}

const server = http.createServer((req, res) => {
  req.on('error', () => {});
  res.on('error', () => {});

  const urlPath = decodeURIComponent((req.url || '').split('?')[0]);

  if (urlPath === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, port: PORT, dirs: cfg.paths.libraryDirs }));
    return;
  }

  if (!urlPath.startsWith('/pkg/')) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found. Usa /pkg/<archivo> o /healthz');
    return;
  }

  const filename = path.basename(urlPath);
  const resolved = resolvePkg(filename);
  if (!resolved) {
    logPs5(TAG, `404 NOT FOUND: ${filename}`, cfg.state.logFile);
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('File not found');
    return;
  }
  if (resolved.fuzzy) {
    logThrottled(filename, `AVISO: resolución difusa para ${filename} -> ${path.basename(resolved.filePath)} (no había coincidencia exacta)`);
  }

  const { filePath } = resolved;
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    res.writeHead(500);
    res.end();
    return;
  }
  const fileSize = stat.size;
  const range = req.headers.range;

  if (req.method === 'HEAD') {
    logThrottled(`${filename}#head`, `HEAD ${filename} desde ${req.socket.remoteAddress} — respondiendo tamaño ${fileSize}`);
    res.writeHead(200, { 'Content-Length': fileSize, 'Accept-Ranges': 'bytes', 'Content-Type': 'application/octet-stream' });
    res.end();
    return;
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = Number(parts[0]);
    let end = parts[1] ? Number(parts[1]) : fileSize - 1;
    if (Number.isNaN(start) || start > end || start >= fileSize) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      res.end();
      return;
    }
    if (Number.isNaN(end) || end >= fileSize) end = fileSize - 1;

    const chunkSize = end - start + 1;
    const reqT0 = Date.now();
    logPs5(
      TAG,
      `RANGE "${range}" chunk=${(chunkSize / 1e6).toFixed(1)} MB UA="${req.headers['user-agent'] || ''}" — ${filename}`,
      cfg.state.logFile,
    );
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'application/octet-stream',
      Connection: 'keep-alive',
      'Keep-Alive': 'timeout=30, max=1000',
    });
    const stream = fs.createReadStream(filePath, { start, end, highWaterMark: 1024 * 1024 });
    let sent = 0;
    stream.on('data', (chunk) => {
      sent += chunk.length;
    });
    req.on('close', () => stream.destroy());
    res.on('close', () => {
      const secs = Math.max((Date.now() - reqT0) / 1000, 0.001);
      const mb = sent / 1e6;
      logPs5(TAG, `FIN ${filename}: ${mb.toFixed(1)} MB en ${secs.toFixed(1)}s (${(mb / secs).toFixed(1)} MB/s)`);
    });
    stream.on('error', () => {
      stream.destroy();
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    stream.pipe(res);
    return;
  }

  logThrottled(filename, `GET ${filename} completo (${(fileSize / 1e9).toFixed(2)} GB)`);
  res.writeHead(200, {
    'Content-Length': fileSize,
    'Accept-Ranges': 'bytes',
    'Content-Type': 'application/octet-stream',
    Connection: 'keep-alive',
    'Keep-Alive': 'timeout=30, max=1000',
  });
  const stream = fs.createReadStream(filePath, { highWaterMark: 1024 * 1024 });
  req.on('close', () => stream.destroy());
  stream.on('error', () => stream.destroy());
  stream.pipe(res);
});

server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) return;
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});

function main() {
  if (!acquirePid(PID_FILE)) {
    console.error(`[PS5 SERVER] Ya hay una instancia viva (pidfile ${PID_FILE}). Saliendo.`);
    process.exit(1);
  }
  process.on('exit', () => releasePid(PID_FILE));
  process.on('SIGINT', () => {
    console.log('\n[PS5 SERVER] Cerrando...');
    process.exit(0);
  });
  process.on('uncaughtException', (err) => {
    logPs5(TAG, `Excepción capturada y neutralizada: ${err.message}`, cfg.state.logFile);
  });
  server.listen(PORT, '0.0.0.0', () => {
    logPs5(TAG, `Multi-Drive Server en http://${cfg.ps5.pcIp}:${PORT} sirviendo: ${cfg.paths.libraryDirs.join(' | ')}`, cfg.state.logFile);
  });
}

main();

module.exports = { resolvePkg };
