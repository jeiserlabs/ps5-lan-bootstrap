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

const message = `📡 *RESPUESTA SOBRE AKIRABOX & ESTADO ACTUAL* 📡

1. *¿SE PIERDE LO DESCARGADO?*
• *¡CERO! Cero bytes perdidos.*
• Están guardados físicamente en disco:
  - *Horizon Zero Dawn*: 14.52 GB (38.6%)
  - *Horizon Forbidden West*: 14.07 GB (19.7%)
  - *God of War 2018*: 12.63 GB (35.0%)
  - *God of War Ragnarök*: 12.62 GB (15.0%)
• *Total ya en tu SSD: 53.84 GB intactos*.

2. *¿SE MUEREN LOS ENLACES?*
• *NO están muertos*: Los archivos siguen 100% en AkiraBox.
• Lo único que vence es el token temporal de sesión (dura 2 horas por seguridad anti-leech).

3. *¿CÓMO SE REANUDAN SIN PERDER NADA?*
• AkiraBox pide confirmar un check de Cloudflare en navegador.
• Al volver, en IDM: *Clic derecho ➔ Actualizar dirección de descarga*.
• Abre Brave, das clic en Descargar (1 seg), IDM captura el nuevo token y *continúa la descarga desde el 38% o 50% donde iba con HTTP Range*.

4. *EN ESTE INSTANTE:*
• *It Takes Two*: ya cruzó *23.0 GB de 34 GB (67%)* a full velocidad.
• Inmediatamente siguen las *15 partes de MediaFire* (MLB, Tsushima, GoW Update) que no tienen captcha ni token corto y descargarán solas toda la tarde. 🚀`;

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
