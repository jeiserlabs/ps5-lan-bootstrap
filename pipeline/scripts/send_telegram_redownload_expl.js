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

const message = `🔄 *¿SE RE-DESCARGAN LOS ARCHIVOS CON ERROR?* 🔄

1. *SI UN ARCHIVO SE CORROMPE ➔ SE RE-DESCARGA AUTOMÁTICO*:
• El centinela corre \`7-Zip\` antes de extraer. Si una parte tiene un bit malo o quedó rota por el microcorte, *la rechaza por CRC32, purga los datos corruptos y la vuelve a bajar limpia*.
• Cero riesgo: JAMÁS se extrae ni se guarda un archivo roto en la biblioteca.

2. *LAS DE AKIRABOX NO ESTÁN CORRUPTAS*:
• Las 4 bases de AkiraBox no sufrieron daño de archivo; solo expiró el token temporal de enlace.
• Tienen *53.84 GB sanos guardados en disco*. Al refrescar enlace reanudan desde ese punto para no desperdiciar tus gigas.

🔥 *EN DESCARGA AHORA MISMO:*
• *MLB Update Parte 2*: 88% (8.76 GB / 9.90 GB) ➔ Termina en 2 min
• *MLB Update Parte 3*: 61% (6.00 GB / 9.90 GB)`;

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
