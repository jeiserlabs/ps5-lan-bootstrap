#!/usr/bin/env node
/**
 * @file resolve_pages.js
 * @description Resuelve páginas AkiraBox a URLs directas y prueba cada una
 *   con UA de aria2 (Range 0-0). Reporta nombre/tamaño/estado.
 * Uso: node pipeline/scripts/resolve_pages.js <url1> <url2> ...
 */
'use strict';

const { resolveDownloadUrl } = require('../lib/akira_resolver.js');

async function probe(url) {
  try {
    const r = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0', 'User-Agent': 'aria2/1.37.0' },
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    });
    return { status: r.status, range: r.headers.get('content-range'), type: r.headers.get('content-type') };
  } catch (e) {
    return { status: `ERR ${e.message}`, range: '-', type: '-' };
  }
}

function fileLabel(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    let last = parts.pop() || '';
    if (last.includes('?')) last = last.split('?')[0];
    const m = u.pathname.match(/\/([^/]+\.(rar|pkg))(\?|$)/i);
    if (m) return decodeURIComponent(m[1]).substring(0, 80);
    const exp = u.searchParams.get('expiration') || u.searchParams.get('access');
    const expStr = exp ? new Date(Number(exp.length > 11 ? Number(exp) : Number(exp) * 1000)).toISOString() : 'sin-exp';
    return `${decodeURIComponent(last).substring(0, 60)} | expira: ${expStr}`;
  } catch {
    return url.substring(0, 80);
  }
}

async function main() {
  const pages = process.argv.slice(2);
  if (pages.length === 0) {
    console.error('Uso: resolve_pages.js <url1> ...');
    process.exit(1);
  }
  for (const page of pages) {
    console.log(`\n### ${page}`);
    const res = await resolveDownloadUrl(page, null);
    if (!res.ok) {
      console.log(`  RESOLVE FAIL: ${res.error}`);
      continue;
    }
    console.log(`  DIRECT: ${res.directUrl.substring(0, 100)}...`);
    console.log(`  FILE: ${fileLabel(res.directUrl)}`);
    const p = await probe(res.directUrl);
    console.log(`  PROBE(aria2-UA): ${p.status} | range: ${p.range || '-'} | type: ${p.type || '-'}`);
  }
}

main().catch((e) => { console.error(`FATAL: ${e.message}`); process.exit(1); });
