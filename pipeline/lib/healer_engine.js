/**
 * @file healer_engine.js
 * @description Lógica pura del Centinela Anti-Microcortes de IDM.
 *   Detecta estancamientos por caída de DNS/red y decide reactivación.
 * SRP < 150L.
 */
'use strict';

const https = require('https');
const http = require('http');

/**
 * Evalúa si las descargas de IDM están estancadas comparando mtimes.
 * @param {number[]} mtimeAgesSec - Antigüedad en segundos de los chunks modificados
 * @param {number} stallThresholdSec - Umbral de inactividad (por defecto 45s)
 * @returns {boolean}
 */
function isStalled(mtimeAgesSec, stallThresholdSec = 45) {
  if (!mtimeAgesSec || mtimeAgesSec.length === 0) return true;
  const freshest = Math.min(...mtimeAgesSec);
  return freshest > stallThresholdSec;
}

/**
 * Determina si la cola de IDM tiene elementos pendientes.
 * @param {string} queueString - String de IDs de la cola (ej: "134 135 136")
 * @returns {boolean}
 */
function hasQueuedTasks(queueString) {
  if (!queueString || typeof queueString !== 'string') return false;
  const items = queueString.trim().split(/\s+/).filter(Boolean);
  return items.length > 0;
}

/**
 * Comprueba conectividad externa a internet mediante probe HTTP HEAD rápido.
 * @param {string} probeUrl
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
function checkInternetReachability(probeUrl = 'https://1.1.1.1', timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      const u = new URL(probeUrl);
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.request(u, { method: 'HEAD', headers: { 'User-Agent': 'IDMHealer/1.0' } }, (res) => {
        resolve(res.statusCode >= 200 && res.statusCode < 400);
      });
      req.on('error', () => resolve(false));
      req.setTimeout(timeoutMs, () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    } catch {
      resolve(false);
    }
  });
}

/**
 * Comprueba si un proceso está vivo en Windows mediante tasklist.
 * @param {string} processName (ej: 'IDMan.exe')
 * @returns {boolean}
 */
function isProcessAlive(processName) {
  try {
    const { execSync } = require('child_process');
    const out = execSync(`tasklist /FI "IMAGENAME eq ${processName}" /NH`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.toLowerCase().includes(processName.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Decide la acción de sanación basándose en el estado actual.
 * @param {Object} state
 * @param {boolean} [state.processAlive=true]
 * @param {boolean} state.stalled
 * @param {boolean} state.hasQueue
 * @param {boolean} state.internetOk
 * @param {number} state.timeSinceLastKickSec
 * @param {number} cooldownSec
 * @returns {'RESTART_PROCESS' | 'KICK_RESUME' | 'WAIT_INTERNET' | 'HEALTHY' | 'IDLE'}
 */
function decideHealerAction(state, cooldownSec = 60) {
  if (!state.hasQueue) return 'IDLE';
  if (state.processAlive === false) return 'RESTART_PROCESS';
  if (!state.stalled) return 'HEALTHY';
  if (!state.internetOk) return 'WAIT_INTERNET';
  if (state.timeSinceLastKickSec < cooldownSec) return 'HEALTHY';
  return 'KICK_RESUME';
}

module.exports = {
  isStalled,
  hasQueuedTasks,
  checkInternetReachability,
  isProcessAlive,
  decideHealerAction
};

