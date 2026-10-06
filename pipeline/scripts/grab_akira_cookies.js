#!/usr/bin/env node
/**
 * @file grab_akira_cookies.js
 * @description Obtiene cookies de sesión de AkiraBox vía Brave headless y prueba
 *   descarga directa de una URL firmada con esas cookies.
 * Uso: node pipeline/scripts/grab_akira_cookies.js "<url-directa>"
 */
'use strict';

const { getPs5Config } = require('../lib/config.js');
const cfg = getPs5Config();

async function main() {
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    console.error('Uso: grab_akira_cookies.js "<url>"');
    process.exit(1);
  }
  const { chromium } = require('playwright-core');
  const browser = await chromium.launch({
    executablePath: cfg.paths.braveExe,
    headless: true,
    args: ['--window-size=1280,800', '--disable-blink-features=AutomationControlled'],
  });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await context.newPage();
    await page.goto('https://akirabox.com/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    const cookies = await context.cookies();
    console.log(`COOKIES: ${cookies.length} obtenidas`);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    console.log(`COOKIE_LEN: ${cookieHeader.length}`);
    // Probar la URL firmada con las cookies de sesión
    const resp = await context.request.get(targetUrl, {
      headers: { Range: 'bytes=0-0' },
      timeout: 25000,
    });
    console.log(`PROBE status: ${resp.status()}`);
    console.log(`PROBE content-range: ${resp.headers()['content-range'] || '-'}`);
    console.log(`PROBE content-length: ${resp.headers()['content-length'] || '-'}`);
    console.log(`PROBE content-type: ${resp.headers()['content-type'] || '-'}`);
    if (resp.status() === 200 || resp.status() === 206) {
      console.log('PROBE OK — las cookies de sesión desbloquean la URL');
      console.log(`COOKIE_HEADER::${cookieHeader}`);
    } else {
      const body = (await resp.text()).substring(0, 200);
      console.log(`PROBE FAIL body: ${body}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(`FATAL: ${e.message}`); process.exit(1); });
