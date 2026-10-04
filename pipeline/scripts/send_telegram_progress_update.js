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

const message = `⚡ *REPORTE DE DESCARGAS EN VIVO (02:20 PM)* ⚡

🎮 *JUEGOS Y ARCHIVOS COMPLETADOS RECIÉN:*
• ✅ *It Takes Two* (34.33 GB): *100% COMPLETADO, EXTRAÍDO Y AUDITADO*. Ya está listo e íntegro en tu biblioteca \`E:\\Biblioteca_Juegos_PS\`.
• ✅ *MLB The Show 24 (Base Part 1)*: 9.90 GB *COMPLETADA*.
• ✅ *MLB The Show 24 (Base Part 2)*: 9.90 GB *COMPLETADA*.

🔥 *DESCARGA ACTIVA EN ESTE INSTANTE:*
• *MLB The Show 24 (Base Part 3)*: Va por *8.1 GB de 9.90 GB (82%)* a máxima velocidad (~10.5 MB/s). Termina en ~3 minutos.

📋 *EN COLA SECUENCIAL INMEDIATA (MEDIAFIRE):*
• MLB The Show Base Parts 4 y 5
• MLB The Show Update Parts 1, 2 y 3
• Ghost of Tsushima Parts 1 a 5
• God of War Ragnarök Update Parts 1 y 2

🛡️ *SALUD DEL SISTEMA:*
• Cero microcortes, centinela \`idm_healer\` en guardia cada 20s, velocidad sostenida al tope.`;

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
