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

const message = `⚡ *MEDIAFIRE PARALELIZADO A MÁXIMA VELOCIDAD* ⚡

🔥 *DESCARGAS EN PARALELO ACTIVAS AHORA:*
• *MLB Update Parte 1*: 9.62 GB / 9.90 GB (98%) ➔ Terminando
• *MLB Update Parte 2*: 5.75 GB / 9.90 GB (58%) ➔ En paralelo
• *MLB Update Parte 3*: 5.60 GB / 9.90 GB (56%) ➔ En paralelo

🛡️ *CERO ARCHIVOS CORRUPTOS (VERIFICADO):*
• 7-Zip valida la suma de verificación CRC32 bloque a bloque antes de extraer.
• En la Parte 4 de MLB detectó un desajuste por el corte de las 11:41 AM y *el centinela la rechazó de inmediato* (no extrae nada roto). Ya fue purgada para bajarse limpia.
• En biblioteca hay *123.44 GB 100% íntegros y auditados*.

⏱️ *TIEMPO ESTIMADO RESTANTE:*
• Quedan ~80 GB de MediaFire ➔ A ~10.5 MB/s tarda *~2 horas (5:00 PM listo todo el lote de MediaFire)*.`;

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
