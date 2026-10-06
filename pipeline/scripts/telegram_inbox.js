#!/usr/bin/env node
/**
 * @file telegram_inbox.js
 * @description Daemon buzón Telegram: lee mensajes del usuario (getUpdates),
 *   extrae URLs akirabox.com/download, las empareja con piezas muertas por
 *   nombre de archivo y las reinyecta a aria2 (reanuda parcial .aria2).
 *   Solo acepta mensajes del CHAT_ID configurado. Offset persistido en disco.
 * Uso: node pipeline/scripts/telegram_inbox.js   (detached)
 * SRP < 160L.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { getPs5Config } = require('../lib/config.js');
const { logPs5 } = require('../lib/pipeline_log.js');
const downloadEngine = require('../lib/download_engine.js');
const { sendTelegramMessage } = require('../lib/telegram.js');

const cfg = getPs5Config();
const LOG_FILE = path.join(path.dirname(cfg.state.logFile), 'aria_pilot.log');
const TAG = 'TG_INBOX';
const OFFSET_FILE = path.join(cfg.state.cacheDir, 'tg_offset.txt');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function creds() {
  const env = fs.readFileSync('E:\\ps5\\.env', 'utf8');
  return {
    token: (env.match(/TELEGRAM_BOT_TOKEN\s*=\s*(.+?)\s*$/m) || [])[1] || '',
    chatId: (env.match(/TELEGRAM_CHAT_ID\s*=\s*(.+?)\s*$/m) || [])[1] || '',
  };
}

function api(token, method, body) {
  const payload = JSON.stringify(body || {});
  return new Promise((resolve) => {
    const req = https.request(
      { hostname: 'api.telegram.org', port: 443, path: `/bot${token}/${method}`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 30000 },
      (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => { try { resolve(JSON.parse(b)); } catch { resolve(null); } });
      },
    );
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
    req.write(payload);
    req.end();
  });
}

const { loadLocked } = require('../lib/queue_io.js');

function norm(s) {
  return String(s || '').toLowerCase().replace(/\[dlpsgame\.com\]/g, '').replace(/[^a-z0-9]+/g, '');
}

function fileOf(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/([^/]+\.(rar|pkg))(\?|$)/i);
    if (m) return decodeURIComponent(m[1]);
  } catch {}
  return null;
}

/** Empareja por CUSA + tipo (part1/2/3, update/patch, dlc, base). */
function matchItem(out, item) {
  const o = norm(out);
  const iu = fileOf(item.url || '');
  if (iu && norm(iu) === o) return true;
  if (item.out && norm(item.out) === o) return true;

  const cusaO = (o.match(/cusa\d{5}/) || [])[0];
  const itemStr = norm((iu || '') + ' ' + (item.name || '') + ' ' + (item.out || '') + ' ' + (item.tags || []).join(' '));
  const cusaI = (itemStr.match(/cusa\d{5}/) || [])[0];

  if (cusaO && cusaI && cusaO !== cusaI) return false;

  // 1. Part check (part1, part2, part3...)
  const partO = (o.match(/part\d+/) || [])[0];
  const partI = (itemStr.match(/part\d+/) || [])[0];
  if (partO || partI) {
    return partO === partI && (!cusaO || !cusaI || cusaO === cusaI);
  }

  // 2. Patch / Update check (v1.14, a0114, etc.)
  const isUpdO = o.includes('update') || /v\d+\.\d+/.test(o) || /a\d{4}v\d{4}/.test(o);
  const isUpdI = itemStr.includes('update') || /v\d+\.\d+/.test(itemStr) || /a\d{4}v\d{4}/.test(itemStr);
  if (isUpdO !== isUpdI) return false;

  // 3. DLC check
  const isDlcO = o.includes('dlc') || o.includes('expansion');
  const isDlcI = itemStr.includes('dlc') || itemStr.includes('expansion');
  if (isDlcO !== isDlcI) return false;

  // 4. Base / Game check
  const isBaseO = o.includes('game') || o.includes('base') || o.includes('prelude');
  const isBaseI = itemStr.includes('game') || itemStr.includes('base') || itemStr.includes('prelude');
  if (isBaseO && isBaseI) return true;

  if (isDlcO && isDlcI) return true;
  if (isUpdO && isUpdI) return true;

  return false;
}

async function handleUrls(urls) {
  const guarded = await loadLocked(cfg.state.queueFile);
  if (!guarded) {
    logPs5(TAG, 'Lock ocupado, reintentando ciclo. URLs no procesadas (quedan en chat).', LOG_FILE);
    return;
  }
  const q = guarded.queue;
  const save = () => guarded.release(q);
  // Candidatas: piezas downloading sin gid (muertas), pending, failed o paused.
  const needy = q.items.filter((i) => (i.status === 'pending' || i.status === 'failed' || i.status === 'paused' || (i.status === 'downloading' && !i.gid)));
  const act = await downloadEngine.tellActive().catch(() => []);
  const activeOuts = new Set(
    act.map((d) => (d.files && d.files[0] ? norm(d.files[0].path.split('/').pop()) : '')),
  );
  for (const url of urls) {
    const out = fileOf(url);
    if (!out) {
      logPs5(TAG, 'URL sin nombre de archivo reconocible, ignorada.', LOG_FILE);
      continue;
    }
    // Anti-duplicado: si aria ya lo descarga (mismo out), solo reconciliar gid.
    const dup = act.find((d) => d.files && d.files[0] && norm(d.files[0].path.split('/').pop()) === norm(out));
    if (dup) {
      const owner = q.items.find((i) => i.gid === dup.gid) || needy.find((i) => matchItem(out, i));
      if (owner && !owner.gid) {
        owner.status = 'downloading';
        owner.gid = dup.gid;
        owner.url = url;
        owner.attempts = 0;
        delete owner.error;
        logPs5(TAG, `🔗 Reconciliado (ya descargaba): ${owner.name}`, LOG_FILE);
      } else {
        logPs5(TAG, `⏭️ Duplicado ignorado (ya activo): ${out}`, LOG_FILE);
      }
      continue;
    }
    const item = needy.find((i) => matchItem(out, i));
    if (!item) {
      q.items.push({ name: out, url, status: 'pending', attempts: 0, tags: [], note: 'inyectado vía Telegram, sin pareja' });
      logPs5(TAG, `URL sin pareja, encolada pendiente: ${out}`, LOG_FILE);
      sendTelegramMessage(`⚠️ *Link recibido pero sin pareja clara:*\n\`${out}\`\nLo dejé en cola pendiente. Dime a qué pieza corresponde.`).catch(() => {});
      continue;
    }
    if (item.gid) {
      await downloadEngine.remove(item.gid).catch(() => {});
      await downloadEngine.purgeDownloadResult().catch(() => {});
    }
    const add = await downloadEngine.addUri([url], {
      dir: 'E:/staging',
      out,
      'allow-overwrite': 'true',
      'auto-file-renaming': 'false',
    });
    if (add.ok) {
      item.url = url;
      item.status = 'downloading';
      item.gid = add.gid;
      item.attempts = 0;
      delete item.error;
      logPs5(TAG, `🔗 Reanudado vía Telegram: ${item.name} (GID ${add.gid})`, LOG_FILE);
      sendTelegramMessage(`⬇️ *Reanudado:* ${item.name}\nSigue donde iba.`).catch(() => {});
    } else {
      logPs5(TAG, `❌ addUri falló para ${out}: ${add.error}`, LOG_FILE);
      sendTelegramMessage(`❌ *No pude inyectar:* ${out}\n${add.error}`).catch(() => {});
    }
    await sleep(1500);
  }
  guarded.release(q);
}

async function main() {
  const { token, chatId } = creds();
  if (!token || !chatId) {
    logPs5(TAG, 'Sin credenciales Telegram. Saliendo.', LOG_FILE);
    process.exit(1);
  }
  let offset = 0;
  try { offset = Number(fs.readFileSync(OFFSET_FILE, 'utf8').trim()) || 0; } catch {}
  logPs5(TAG, `Buzón Telegram activo (offset ${offset}).`, LOG_FILE);
  for (;;) {
    try {
      const data = await api(token, 'getUpdates', { offset, timeout: 25, allowed_updates: ['message'] });
      const updates = (data && data.ok && data.result) || [];
      for (const u of updates) {
        offset = Math.max(offset, (u.update_id || 0) + 1);
        const msg = u.message || {};
        const from = String((msg.chat && msg.chat.id) || '');
        if (from !== String(chatId)) continue;
        const text = String(msg.text || '');
        const urls = [...text.matchAll(/https:\/\/akirabox\.com\/download\/\S+/gi)].map((m) => m[0].replace(/[)\]"']+$/, ''));
        if (urls.length > 0) {
          logPs5(TAG, `${urls.length} URL(s) recibidas por Telegram.`, LOG_FILE);
          await handleUrls(urls);
        }
      }
      try { fs.writeFileSync(OFFSET_FILE, String(offset)); } catch {}
    } catch (e) {
      logPs5(TAG, `Error buzón: ${e.message}`, LOG_FILE);
    }
    await sleep(5000);
  }
}

main();
