/**
 * @file telegram.js
 * @description Despachador de notificaciones a Telegram para el pipeline PS5.
 *   Notifica a Jeiser (@Jeiserbot) sobre el avance de descargas, auditorías y fases LAN.
 * SRP < 100L. Cero dependencias externas.
 */
'use strict';

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.resolve(__dirname, '..', '..', '.env');

function loadEnv() {
  const env = {
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  };
  if (fs.existsSync(ENV_PATH)) {
    try {
      const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [k, ...v] = trimmed.split('=');
        if (k && v.length > 0) {
          env[k.trim()] = v.join('=').trim();
        }
      }
    } catch {}
  }
  return env;
}

/**
 * Envía un mensaje a Telegram.
 * @param {string} text Contenido del mensaje (HTML por defecto)
 * @param {'HTML'|'Markdown'} [parseMode='HTML']
 * @returns {Promise<boolean>}
 */
function sendTelegramMessage(text, parseMode = 'HTML') {
  return new Promise((resolve) => {
    const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = loadEnv();
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      return resolve(false);
    }

    const payload = JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    });

    const req = https.request(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 8000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          resolve(res.statusCode === 200);
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

module.exports = { sendTelegramMessage };
