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
 * Lanza un contexto Brave persistente (perfil dedicado en disco).
 * Las cookies (incl. clearance de Cloudflare Turnstile) sobreviven entre runs.
 * @param {boolean} headed
 */
async function launchPersistent(headed) {
  try {
    const chromium = getChromium();
    if (!chromium) return null;
    const fs = require('node:fs');
    fs.mkdirSync(cfg.paths.braveProfileDir, { recursive: true });
    const context = await chromium.launchPersistentContext(cfg.paths.braveProfileDir, {
      executablePath: cfg.paths.braveExe,
      headless: !headed,
      ignoreDefaultArgs: ['--enable-automation'],
      args: [
        '--window-size=1280,800',
        '--disable-blink-features=AutomationControlled',
        '--disable-automation',
      ],
    });
    await context.addInitScript(() => {
      try {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      } catch {}
    });
    return {
      context,
      close: async () => {
        try { await context.close(); } catch {}
      },
    };
  } catch {
    return null;
  }
}

/**
 * Flujo AkiraBox: Espera → Verificar (Turnstile) → Descargar.
 * Requiere perfil con clearance vigente (ver seed_aria_profile.js).
 * @param {string} pageUrl
 * @param {string} [logFile]
 * @param {boolean} headed
 * @returns {Promise<{ ok: boolean, directUrl?: string, error?: string }>}
 */
async function resolveAkiraBox(pageUrl, logFile, headed = false) {
  const launched = await launchPersistent(headed);
  if (!launched) {
    return { ok: false, error: 'Playwright no está disponible para resolver URLs web.' };
  }
  const { context, close } = launched;
  try {
    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    // 1. Esperar que el botón #download se habilite (timer + Turnstile)
    let enabled = false;
    for (let i = 0; i < 90 && !enabled; i++) {
      try {
        const cls = await page.locator('#download').first().getAttribute('class', { timeout: 1500 });
        enabled = Boolean(cls && !cls.includes('pointer-events-none'));
      } catch {}
      if (!enabled) await page.waitForTimeout(2000);
    }
    if (!enabled) {
      return { ok: false, error: 'Botón de descarga nunca se habilitó (timer o Turnstile sin clearance). Re-ejecutar seed_aria_profile.js.' };
    }
    // 2. Clic y captura del evento download (URL firmada fresca)
    const dlPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
    await page.locator('#download').first().click({ timeout: 10000 });
    const dl = await dlPromise;
    if (!dl) return { ok: false, error: 'Clic sin evento download.' };
    const directUrl = dl.url();
    await dl.cancel().catch(() => {});
    if (!directUrl || !directUrl.startsWith('http')) {
      return { ok: false, error: 'URL firmada inválida.' };
    }
    logPs5(TAG, `✅ AkiraBox resuelto: ${directUrl.substring(0, 60)}...`, logFile);
    return { ok: true, directUrl };
  } catch (err) {
    return { ok: false, error: `AkiraBox: ${err.message}` };
  } finally {
    try { await close(); } catch {}
  }
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

  // AkiraBox con Turnstile: perfil persistente + flujo Espera→Verificar→Descargar
  if (pageUrl.includes('akirabox.to') || pageUrl.includes('akirabox.com')) {
    logPs5(TAG, `🌐 Flujo AkiraBox (perfil persistente): ${pageUrl}`, logFile);
    return resolveAkiraBox(pageUrl, logFile, false);
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
  resolveAkiraBox,
};
