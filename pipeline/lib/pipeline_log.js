/**
 * @file pipeline_log.js
 * @description Log único del pipeline PS5: consola + append a data/logs/ps5_pipeline.log.
 * SRP < 300L.
 */
const fs = require('node:fs');
const path = require('node:path');

/**
 * @param {string} tag
 * @param {string} message
 * @param {string} [logFile] ruta del archivo de log (opcional)
 */
function logPs5(tag, message, logFile) {
  const line = `[${new Date().toISOString()}] [${tag}] ${message}`;
  console.log(line);
  if (!logFile) return;
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `${line}\n`);
  } catch {
    // El log en disco es best-effort: nunca debe tumbar el pipeline.
  }
}

module.exports = { logPs5 };
