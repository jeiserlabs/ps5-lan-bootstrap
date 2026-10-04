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

if (!botToken || !chatId) {
  console.error('Error: missing Telegram botToken or chatId');
  process.exit(1);
}

const message = `🚨 *REPORTE ESTADO DESCARGAS PS5 (IDM)* 🚨

🔍 *DIAGNÓSTICO: ¿QUÉ PASÓ?*
1. *Micro-corte de red (11:41 AM)*: Hubo caída breve de DNS/conexión. IDM marcó "No se puede encontrar el servidor" y frenó la cola automática.
2. *MediaFire (15 partes)*: 100% VIVAS Y SALUDABLES (HTTP 200 verificado). Cero fallas.
3. *AkiraBox (4 juegos base)*: Tokens de sesión temporales vencidos por tiempo de espera en cola (HZD Base, HFW Base, GoW 2018 Base, GoW Ragnarök Base).

⚡ *ACCIONES TOMADAS Y REANUDACIÓN:*
• Cola reactivada con comando IDM.
• Tarea activa ahora: *It Takes Two Update v1.03* (34.33 GB) descargando a ~9 MB/s (va por >16.5 GB).
• Seguirán en automático las partes de *MLB The Show 24*, *Ghost of Tsushima* y *GoW Ragnarök Update* vía MediaFire sin bloqueos.

📦 *LO QUE YA QUEDÓ 100% DESCARGADO E ÍNTEGRO HOY:*
• Mortal Kombat 11 Ultimate (Base + Update + DLCs)
• God of War Ragnarök Base + Update v6.05
• God of War 2018 Base + Update v1.35 + DLCs
• Horizon Forbidden West Update v1.18 + DLCs Deluxe
• Horizon Zero Dawn Update v1.54 + DLCs Frozen Wilds
• Ghost of Tsushima Director's Cut DLCs
• MLB The Show 24 (partes 6 base y 4 update)

🎯 *PLAN PARA AKIRABOX:*
• Reordenamos cola para que MediaFire descargue continuo sin detenerse.
• Los 4 de AkiraBox los refrescamos en 1 clic al regresar para descargar sin esperas.`;

const payload = JSON.stringify({
  chat_id: chatId,
  text: message,
  parse_mode: 'Markdown'
});

const req = https.request({
  hostname: 'api.telegram.org',
  path: `/bot${botToken}/sendMessage`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Telegram API response status:', res.statusCode);
    console.log('Response:', body);
  });
});

req.on('error', (err) => {
  console.error('Telegram request error:', err.message);
});

req.write(payload);
req.end();
