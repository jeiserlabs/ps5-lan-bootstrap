/**
 * @file telegram.js
 * @description Notificaciones Telegram fire-and-forget (nunca bloquean ni tumban).
 *   Lee TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID de E:\ps5\.env.
 *   Solo hitos (juego listo, fallos, resumen) para no spamear ni robar banda.
 * SRP < 100L. Cero dependencias.
 */
'use strict';

const https = require('node:https');
const fs = require('node:fs');

let cached = null;
function creds() {
  if (cached) return cached;
  cached = { token: '', chatId: '' };
  try {
    const env = fs.readFileSync('E:\\ps5\\.env', 'utf8');
    for (const line of env.split('\n')) {
      const m = line.match(/^\s*TELEGRAM_BOT_TOKEN\s*=\s*(.+?)\s*$/);
      if (m) cached.token = m[1];
      const c = line.match(/^\s*TELEGRAM_CHAT_ID\s*=\s*(.+?)\s*$/);
      if (c) cached.chatId = c[1];
    }
  } catch {}
  return cached;
}

function postMessage(token, body) {
  const payload = JSON.stringify(body);
  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        timeout: 25000,
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode === 200));
      },
    );
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

/**
 * Envía un mensaje sin esperar respuesta útil. Nunca rechaza.
 * Intenta Markdown primero, y si falla por formato, hace fallback a texto plano.
 * @param {string} text
 * @returns {Promise<boolean>} true si Telegram dijo ok
 */
async function sendTelegramMessage(text) {
  const { token, chatId } = creds();
  if (!token || !chatId) return false;
  const cleanText = text.substring(0, 3500);
  const ok = await postMessage(token, { chat_id: chatId, text: cleanText, parse_mode: 'Markdown' });
  if (ok) return true;
  return postMessage(token, { chat_id: chatId, text: cleanText });
}

module.exports = { sendTelegramMessage };
