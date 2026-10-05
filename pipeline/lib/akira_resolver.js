/**
 * @file akira_resolver.js
 * @description Resolvedor autónomo de URLs directas de AkiraBox y enlaces de descarga.
 *   Si la URL ya es directa (.pkg/.rar o link firmado), la retorna inmediatamente.
 *   Si es página web de AkiraBox, resuelve el enlace firmado vía Playwright headless.
 * SRP < 150L.
 */
'use strict';

const { getPs5Config } = require('./config.js');
const { logPs5 } = require('./pipeline_log.js');

const cfg = getPs5Config();
const TAG = 'RESOLVER';

/**
 * Determina si una URL ya es un enlace directo de descarga.
 * @param {string} url
 * @returns {boolean}
 */
function isDirectDownloadUrl(url) {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  if (lower.includes('download.akirabox.com')) return true;
  if (lower.includes('/download/') && (lower.includes('expiration=') || lower.includes('access='))) return true;
  if (lower.includes('mediafire.com') && lower.includes('/mp8hvhvny')) return true;
  if (lower.includes('1fichier.com') && lower.includes('&inline=')) return true;
  if (lower.endsWith('.pkg') || lower.endsWith('.rar') || lower.endsWith('.zip') || lower.endsWith('.7z')) return true;
  return false;
}

/**
 * Carga chromium de forma segura con fallback.
 */
function getChromium() {
  try { return require('playwright-core').chromium; } catch {}
  try { return require('playwright').chromium; } catch {}
  return null;
}

/**
 * Resuelve una URL de página web a su enlace directo firmado.
 * @param {string} pageUrl
 * @param {string} [logFile]
 * @returns {Promise<{ ok: boolean, directUrl?: string, error?: string }>}
 */
async function resolveDownloadUrl(pageUrl, logFile) {
  if (isDirectDownloadUrl(pageUrl)) {
    return { ok: true, directUrl: pageUrl };
  }

  const chromium = getChromium();
  if (!chromium) {
    const err = 'Playwright no está disponible para resolver URLs web.';
    logPs5(TAG, `❌ ${err}`, logFile);
    return { ok: false, error: err };
  }

  logPs5(TAG, `🌐 Resolviendo enlace firmado en segundo plano: ${pageUrl}`, logFile);
  let browser = null;
  try {
    browser = await chromium.launch({
      executablePath: cfg.paths.braveExe,
      headless: true,
      args: ['--window-size=1280,800', '--disable-blink-features=AutomationControlled'],
    });

    const context = await browser.newContext();
    const page = await context.newPage();
    let directUrl = null;

    // Interceptar llamadas API de descarga
    page.on('response', async (res) => {
      const u = res.url();
      if (!u.includes('/download') && !u.includes('/file')) return;
      try {
        const body = await res.text();
        const json = JSON.parse(body);
        const found = json.downloadUrl || json.url || json.download_url;
        if (found && String(found).startsWith('http')) directUrl = found;
      } catch {}
    });

    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(2000);

    // 1. Manejo directo para Mediafire: captura del evento 'download'
    if (pageUrl.includes('mediafire.com')) {
      try {
        const btn = page.locator('#downloadButton').first();
        if ((await btn.count()) > 0) {
          const [ dl ] = await Promise.all([
            page.waitForEvent('download', { timeout: 8000 }),
            btn.click(),
          ]);
          directUrl = dl.url();
        }
      } catch {}
    }

    // 2. Intentar resolver captcha o click en botón de descarga (AkiraBox / genérico)
    for (let i = 0; i < 10 && !directUrl; i++) {
      try {
        const btn = page.locator('#download, a:has-text("Download"), button:has-text("Download")').first();
        if ((await btn.count()) > 0) {
          const href = await btn.getAttribute('href');
          if (href && href.startsWith('http') && href !== pageUrl) {
            directUrl = href;
            break;
          }
          await btn.click({ timeout: 1500 });
        }
      } catch {}
      await page.waitForTimeout(1000);
    }

    if (directUrl) {
      logPs5(TAG, `✅ Enlace firmado resuelto con éxito: ${directUrl.substring(0, 60)}...`, logFile);
      return { ok: true, directUrl };
    }

    return { ok: false, error: 'No se pudo extraer el enlace de descarga de la página.' };
  } catch (err) {
    logPs5(TAG, `❌ Error en resolución Playwright: ${err.message}`, logFile);
    return { ok: false, error: err.message };
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
}

module.exports = {
  isDirectDownloadUrl,
  resolveDownloadUrl,
};
