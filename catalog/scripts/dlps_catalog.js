'use strict';

const path = require('path');
const fs = require('fs');
const { getDb, upsertBatch, searchGames, getStats, setMeta } = require('../lib/dlps_db');
const { scrapePlatformList, fetchUrl, URLS } = require('../lib/dlps_scraper');

async function syncCatalog(options = {}) {
  const db = getDb(options.dbPath);
  console.log('🔄 Sincronizando catálogo de juegos desde DLPSGAME...');

  let ps4Games = [];
  let ps5Games = [];

  // Check if we have cached step files for immediate zero-latency seed
  const stepPs4 = path.resolve('C:/Users/dev/.gemini/antigravity/brain/3c4fbe10-0644-4104-a008-2d45524ff992/.system_generated/steps/3021/content.md');
  const stepPs5 = path.resolve('C:/Users/dev/.gemini/antigravity/brain/3c4fbe10-0644-4104-a008-2d45524ff992/.system_generated/steps/3025/content.md');

  try {
    if (fs.existsSync(stepPs4)) {
      console.log('⚡ Cargando lista PS4 desde caché local...');
      ps4Games = await scrapePlatformList('ps4', fs.readFileSync(stepPs4, 'utf8'));
    } else {
      console.log('🌐 Descargando lista PS4 desde DLPSGAME...');
      ps4Games = await scrapePlatformList('ps4');
    }
    console.log(`✅ PS4: ${ps4Games.length} juegos parseados.`);
  } catch (err) {
    console.warn('⚠️ Error descargando PS4:', err.message);
  }

  try {
    if (fs.existsSync(stepPs5)) {
      console.log('⚡ Cargando lista PS5 desde caché local...');
      ps5Games = await scrapePlatformList('ps5', fs.readFileSync(stepPs5, 'utf8'));
    } else {
      console.log('🌐 Descargando lista PS5 desde DLPSGAME...');
      ps5Games = await scrapePlatformList('ps5');
    }
    console.log(`✅ PS5: ${ps5Games.length} juegos parseados.`);
  } catch (err) {
    console.warn('⚠️ Error descargando PS5:', err.message);
  }

  const allGames = [...ps4Games, ...ps5Games];
  if (allGames.length > 0) {
    const inserted = upsertBatch(allGames, db);
    setMeta('last_sync', new Date().toISOString(), db);
    console.log(`💾 Base de datos actualizada: ${inserted} juegos guardados.`);
  }

  const stats = getStats(db);
  console.log(`📊 Total en BD: ${stats.total} juegos (PS4: ${stats.ps4} | PS5: ${stats.ps5})`);
  db.close();
}

function handleSearch(args) {
  const query = args.filter(a => !a.startsWith('--')).join(' ');
  const platformArg = args.find(a => a.startsWith('--platform='));
  const platform = platformArg ? platformArg.split('=')[1] : null;

  const db = getDb();
  const results = searchGames({ query, platform, limit: 25 }, db);
  db.close();

  console.log(`\n🔍 Resultados para "${query || '*'}" ${platform ? `[${platform.toUpperCase()}]` : ''} (${results.length} encontrados):`);
  console.log('─'.repeat(80));
  if (results.length === 0) {
    console.log('No se encontraron juegos con esos criterios.');
    return;
  }

  for (const g of results) {
    const tags = g.tags ? ` [${g.tags}]` : '';
    console.log(`• [${g.platform.toUpperCase()}] ${g.title}${tags}`);
    console.log(`  🔗 ${g.url}`);
  }
  console.log('─'.repeat(80));
}

function handleRecommend(theme) {
  const db = getDb();
  let tag = null;
  let query = '';

  const t = (theme || '').toLowerCase();
  if (t.includes('amor') || t.includes('pareja') || t.includes('coop') || t.includes('cooperativo')) {
    tag = 'coop';
    query = 'two';
  } else if (t.includes('anime') || t.includes('inuyasha') || t.includes('sailor')) {
    tag = 'anime';
  } else if (t.includes('nino') || t.includes('niño') || t.includes('familiar')) {
    tag = 'kids_family';
  } else if (t.includes('carrera') || t.includes('auto') || t.includes('carro')) {
    tag = 'racing';
  } else if (t.includes('pelea') || t.includes('lucha')) {
    tag = 'fighting';
  } else if (t.includes('terror') || t.includes('miedo')) {
    tag = 'horror';
  } else {
    query = theme;
  }

  const results = searchGames({ query, tag, limit: 15 }, db);
  db.close();

  console.log(`\n⭐ Recomendaciones para: "${theme}" (${results.length} opciones):`);
  console.log('─'.repeat(80));
  for (const g of results) {
    console.log(`• [${g.platform.toUpperCase()}] ${g.title}`);
    console.log(`  🔗 ${g.url}`);
  }
  console.log('─'.repeat(80));
}

function handleStats() {
  const db = getDb();
  const stats = getStats(db);
  console.log('\n📊 ESTADÍSTICAS DEL CATÁLOGO DLPSGAME:');
  console.log('─'.repeat(50));
  console.log(`• Total de juegos:    ${stats.total}`);
  console.log(`• Juegos PS4:         ${stats.ps4}`);
  console.log(`• Juegos PS5:         ${stats.ps5}`);
  console.log(`• Última sincro:      ${stats.lastSync ? stats.lastSync.updated_at : 'Nunca'}`);
  console.log('─'.repeat(50));
  db.close();
}

function handleInstalled() {
  const { getInstalledGames } = require('../../lib/games/dlps_db');
  const db = getDb();
  const list = getInstalledGames(db);
  console.log('\n🎮 REGISTRO DE JUEGOS EN PS5 (Control Anti-Duplicados):');
  console.log('─'.repeat(75));
  if (list.length === 0) {
    console.log('No hay juegos registrados aún.');
  } else {
    for (const g of list) {
      console.log(`• [${g.status.toUpperCase()}] ${g.title} (${g.size_gb} GB)`);
      console.log(`  CUSA: ${g.cusa || 'N/A'} | USB: ${g.usb_drive || 'N/A'} | Fecha: ${g.installed_at}`);
    }
  }
  console.log('─'.repeat(75));
  db.close();
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  switch (cmd) {
    case 'sync':
      await syncCatalog();
      break;
    case 'search':
      handleSearch(args);
      break;
    case 'recommend':
      handleRecommend(args.join(' '));
      break;
    case 'stats':
      handleStats();
      break;
    case 'installed':
      handleInstalled();
      break;
    default:
      console.log('Uso: node dlps_catalog.js <sync | search <termino> | recommend <tema> | stats | installed>');
      break;
  }
}

if (require.main === module) {
  main().catch(err => console.error('Error fatal:', err));
}

module.exports = {
  syncCatalog,
  handleSearch,
  handleRecommend,
  handleStats
};
