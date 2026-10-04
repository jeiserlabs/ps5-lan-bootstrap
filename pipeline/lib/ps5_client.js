/**
 * @file ps5_client.js
 * @description Cliente HTTP unificado de producción para comunicación con la PS5.
 *   Encapsula las llamadas al WebKit Autoloader / Payload Manager (:8084)
 *   y al pkg-receiver (:12800).
 * SRP < 150L. Cero dependencias externas.
 */
'use strict';

const http = require('node:http');

/**
 * Realiza una petición HTTP GET con timeout estricto y manejo de errores fail-closed.
 * @param {string} url
 * @param {number} [timeoutMs=5000]
 * @returns {Promise<{ status: number, body: string } | null>}
 */
function ps5HttpGet(url, timeoutMs = 5000) {
  return new Promise((resolve) => {
    try {
      const req = http.get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ status: res.statusCode || 0, body }));
      });
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve(null);
      });
      req.on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * Consulta la versión del Payload Manager en la PS5.
 */
async function queryPs5Version(ip, port = 8084, timeoutMs = 3000) {
  const res = await ps5HttpGet(`http://${ip}:${port}/version`, timeoutMs);
  return (res && res.status === 200) ? res.body.trim() : null;
}

/**
 * Consulta la lista de autoload configurada en el Payload Manager.
 */
async function queryPs5Autoload(ip, port = 8084, timeoutMs = 3000) {
  const res = await ps5HttpGet(`http://${ip}:${port}/get_config`, timeoutMs);
  return (res && res.status === 200) ? res.body.trim() : null;
}

/**
 * Inyecta un payload en caliente en el Payload Manager.
 */
async function injectPayload(ip, port = 8084, payloadName, timeoutMs = 5000) {
  const res = await ps5HttpGet(`http://${ip}:${port}/loadpayload:${encodeURIComponent(payloadName)}`, timeoutMs);
  return (res && res.status === 200 && res.body.toLowerCase().includes('ok'));
}

/**
 * Dispara la instalación de un PKG en el pkg-receiver de la PS5 (:12800).
 */
async function triggerPkgInstall(ip, installPort = 12800, fileUrl, filename, timeoutMs = 8000) {
  const installUrl = `http://${ip}:${installPort}/install?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(filename)}`;
  const res = await ps5HttpGet(installUrl, timeoutMs);
  if (!res || res.status !== 200) return { ok: false, error: res ? `HTTP ${res.status}` : 'timeout' };
  try {
    const data = JSON.parse(res.body);
    return { ok: true, data };
  } catch {
    return { ok: res.body.toLowerCase().includes('ok'), raw: res.body };
  }
}

/**
 * Consulta el estado de consolidación del instalador de la PS5.
 */
async function queryInstallStatus(ip, installPort = 12800, timeoutMs = 3000) {
  const res = await ps5HttpGet(`http://${ip}:${installPort}/api/status`, timeoutMs);
  if (!res || res.status !== 200) return null;
  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

module.exports = {
  ps5HttpGet,
  queryPs5Version,
  queryPs5Autoload,
  injectPayload,
  triggerPkgInstall,
  queryInstallStatus,
};
