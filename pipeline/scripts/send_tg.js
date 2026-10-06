#!/usr/bin/env node
'use strict';

const { sendTelegramMessage } = require('../lib/telegram.js');

async function main() {
  const text = process.argv.slice(2).join(' ') || (require('fs').readFileSync(0, 'utf-8'));
  if (!text) {
    console.error('Uso: node send_tg.js <mensaje>');
    process.exit(1);
  }
  const ok = await sendTelegramMessage(text);
  console.log('TELEGRAM_SENT:', ok);
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
