const fs = require('fs');
const https = require('https');

function getEnv(path) {
  const content = fs.readFileSync(path, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) {
      env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
    }
  }
  return env;
}

const env = getEnv('e:\\PROYECTOS\\Mis_Proyectos\\Asistente_Personal\\.env');
const botToken = env.TELEGRAM_BOT_TOKEN;
const chatId = env.TELEGRAM_CHAT_ID;

const message = `🛡️ *CENTINELA ANTI-MICROCORTES DESPLEGADO* 🛡️

Quedó activo en segundo plano \`idm_healer.js\`:
• *Supervisión cada 20s*: Si los chunks de IDM se quedan sin escribir >45s, verifica internet.
• *Auto-Reanudación*: Si internet vuelve, ejecuta \`IDMan.exe /s\` en automático con cooldown de 60s.
• *Cero bloqueos*: Toda la cola correrá sin pausarse por microcortes de router o Wi-Fi.

Progreso actual: *It Takes Two* ya va por *18.5 GB de 34 GB (54%)*. Sigue descargando a tope de banda. 🚀`;

const payload = JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' });
const req = https.request({
  hostname: 'api.telegram.org',
  path: `/bot${botToken}/sendMessage`,
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
});
req.on('error', () => {});
req.write(payload);
req.end();
