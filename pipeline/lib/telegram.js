/**
 * @file telegram.js
 * @description Notificaciones Telegram deshabilitadas permanentemente.
 *   Cero llamadas de red para optimizar recursos y no bloquear descargas.
 * SRP < 100L.
 */
'use strict';

/**
 * No-op: notificaciones desactivadas para rendimiento máximo y cero sobrecarga de red.
 * @returns {Promise<boolean>}
 */
function sendTelegramMessage() {
  return Promise.resolve(false);
}

module.exports = { sendTelegramMessage };
