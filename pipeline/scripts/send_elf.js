#!/usr/bin/env node
/**
 * @file send_elf.js
 * @description Envía un payload ELF a una PS5 jailbroken por LAN usando elfldr (TCP, 9021 por defecto).
 *   Sirve para instaladores (ej. WebKit Autoloader), etaHEN, pkg-receiver y cualquier payload .elf.
 * Uso:
 *   node scripts/ps5/send_elf.js <ruta.elf> [--ip 192.168.2.2] [--port 9021]
 * SRP < 300L.
 */
const fs = require('node:fs');
const net = require('node:net');

const DEFAULT_IP = process.env.PS5_IP || '192.168.2.2';
const DEFAULT_PORT = Number(process.env.PS5_ELFLD_PORT || 9021);

/**
 * @param {string[]} argv
 * @returns {{ filePath: string, ip: string, port: number }}
 */
function parseArgs(argv) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const filePath = positional[0];
  if (!filePath) {
    console.error('Uso: node scripts/ps5/send_elf.js <ruta.elf> [--ip 192.168.2.2] [--port 9021]');
    process.exit(2);
  }
  const ipIdx = argv.indexOf('--ip');
  const portIdx = argv.indexOf('--port');
  return {
    filePath,
    ip: ipIdx >= 0 ? argv[ipIdx + 1] : DEFAULT_IP,
    port: portIdx >= 0 ? Number(argv[portIdx + 1]) : DEFAULT_PORT,
  };
}

/**
 * Envía el ELF: connect -> write -> end -> espera respuesta/cierre.
 * elfldr interpreta el cierre del socket como fin del payload, por eso se hace end().
 * @param {{ filePath: string, ip: string, port: number, timeoutMs?: number }} opts
 * @returns {Promise<{ bytes: number, response: string }>}
 */
function sendElf(opts) {
  const timeoutMs = opts.timeoutMs || 8000;
  return new Promise((resolve, reject) => {
    let data;
    try {
      data = fs.readFileSync(opts.filePath);
    } catch (err) {
      reject(new Error(`No se pudo leer el ELF: ${err.message}`));
      return;
    }

    const socket = net.connect({ host: opts.ip, port: opts.port });
    let response = '';
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else resolve({ bytes: data.length, response });
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => {
      console.log(`[PS5 ELF] Conectado a ${opts.ip}:${opts.port}. Enviando ${(data.length / 1024).toFixed(1)} KB...`);
      socket.write(data, () => socket.end());
    });
    socket.on('data', (chunk) => {
      response += chunk.toString();
    });
    socket.on('timeout', () => finish(null));
    socket.on('close', () => finish(null));
    socket.on('error', (err) => finish(err));
  });
}

async function main() {
  const { filePath, ip, port } = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(filePath)) {
    console.error(`[PS5 ELF] Archivo no encontrado: ${filePath}`);
    process.exit(1);
  }
  try {
    const res = await sendElf({ filePath, ip, port });
    console.log(`[PS5 ELF] Payload enviado (${res.bytes} bytes).`);
    if (res.response.trim()) console.log(`[PS5 ELF] Respuesta de la consola: ${res.response.trim()}`);
    console.log('[PS5 ELF] Listo. Revisa la pantalla de la PS5 para confirmar la ejecución del payload.');
  } catch (err) {
    console.error(`[PS5 ELF] ERROR: ${err.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { sendElf };
