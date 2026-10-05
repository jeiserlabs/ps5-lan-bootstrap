/**
 * @file download_engine.js
 * @description Cliente JSON-RPC HTTP de bajo nivel para el motor headless aria2c.
 *   Encapsula comandos con autenticación RPC secret y manejo de errores fail-closed.
 * SRP < 200L. Cero dependencias npm (usa node:http nativo).
 */
'use strict';

const http = require('node:http');
const { getPs5Config } = require('./config.js');

const RPC_SECRET = 'ps5_lan_secret_2026';
const RPC_HOST = '127.0.0.1';
const DEFAULT_RPC_PORT = 6800;
let activePort = DEFAULT_RPC_PORT;

function setRpcPort(port) {
  activePort = port || DEFAULT_RPC_PORT;
}

function getRpcPort() {
  return activePort;
}

/**
 * Ejecuta una llamada JSON-RPC contra aria2c con timeout estricto.
 * @param {string} method Método RPC (ej: 'aria2.addUri')
 * @param {any[]} [params=[]] Parámetros del método
 * @param {number} [timeoutMs=5000]
 * @param {number} [portOverride]
 * @returns {Promise<{ ok: boolean, result?: any, error?: string }>}
 */
function rpcCall(method, params = [], timeoutMs = 5000, portOverride = null) {
  return new Promise((resolve) => {
    const port = portOverride || activePort;
    const tokenParam = `token:${RPC_SECRET}`;
    const fullParams = [tokenParam, ...params];
    const payload = JSON.stringify({
      jsonrpc: '2.0',
      id: `ps5_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      method,
      params: fullParams,
    });

    const req = http.request(
      {
        hostname: RPC_HOST,
        port,
        path: '/jsonrpc',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            resolve({ ok: false, error: `HTTP ${res.statusCode}: ${body.substring(0, 100)}` });
            return;
          }
          try {
            const data = JSON.parse(body);
            if (data.error) {
              resolve({ ok: false, error: data.error.message || 'RPC Error' });
            } else {
              resolve({ ok: true, result: data.result });
            }
          } catch (e) {
            resolve({ ok: false, error: `Invalid JSON response: ${e.message}` });
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, error: 'RPC timeout' });
    });
    req.on('error', (err) => {
      resolve({ ok: false, error: err.message });
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Comprueba si el daemon aria2c está vivo y respondiendo RPC.
 * @returns {Promise<boolean>}
 */
async function isRpcAlive() {
  const res = await rpcCall('aria2.getVersion', [], 2000);
  return !!(res.ok && res.result && res.result.version);
}

/**
 * Agrega una descarga a la cola de aria2.
 * @param {string[]} uris Array de URLs para el archivo
 * @param {Record<string, string>} [options={}] Opciones como dir, out, header
 * @returns {Promise<{ ok: boolean, gid?: string, error?: string }>}
 */
async function addUri(uris, options = {}) {
  const res = await rpcCall('aria2.addUri', [uris, options]);
  return res.ok ? { ok: true, gid: res.result } : { ok: false, error: res.error };
}

/**
 * Consulta el estado detallado de una descarga por su GID.
 * @param {string} gid
 * @returns {Promise<{ ok: boolean, status?: any, error?: string }>}
 */
async function tellStatus(gid) {
  const res = await rpcCall('aria2.tellStatus', [gid, [
    'gid', 'status', 'totalLength', 'completedLength',
    'downloadSpeed', 'files', 'errorCode', 'errorMessage',
  ]]);
  return res.ok ? { ok: true, status: res.result } : { ok: false, error: res.error };
}

/**
 * Obtiene la lista de descargas activas en curso.
 * @returns {Promise<any[]>}
 */
async function tellActive() {
  const res = await rpcCall('aria2.tellActive', [[
    'gid', 'status', 'totalLength', 'completedLength',
    'downloadSpeed', 'files', 'errorCode', 'errorMessage',
  ]]);
  return res.ok && Array.isArray(res.result) ? res.result : [];
}

/**
 * Pausa una descarga activa.
 */
async function pause(gid) {
  return rpcCall('aria2.pause', [gid]);
}

/**
 * Reanuda una descarga pausada.
 */
async function unpause(gid) {
  return rpcCall('aria2.unpause', [gid]);
}

/**
 * Elimina una descarga.
 */
async function remove(gid) {
  return rpcCall('aria2.remove', [gid]);
}

/**
 * Cambia dinámicamente la URL de una descarga en caliente (para renovación de tokens).
 * @param {string} gid
 * @param {number} fileIndex Índice de archivo (1-based en aria2)
 * @param {string[]} delUris URLs a eliminar
 * @param {string[]} addUris URLs nuevas a inyectar
 */
async function changeUri(gid, fileIndex, delUris, addUris) {
  return rpcCall('aria2.changeUri', [gid, fileIndex, delUris, addUris]);
}

/**
 * Limpia resultados de descargas completadas o con error en memoria de aria2.
 */
async function purgeDownloadResult() {
  return rpcCall('aria2.purgeDownloadResult', []);
}

module.exports = {
  rpcCall,
  isRpcAlive,
  addUri,
  tellStatus,
  tellActive,
  pause,
  unpause,
  remove,
  changeUri,
  purgeDownloadResult,
  setRpcPort,
  getRpcPort,
  RPC_SECRET,
  RPC_PORT: DEFAULT_RPC_PORT,
};
