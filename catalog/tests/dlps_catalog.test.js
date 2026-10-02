'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { getDb, upsertBatch, searchGames, getStats, setMeta, extractSlug } = require('../lib/dlps_db.js');
const { inferTags, cleanTitle, parseGameList } = require('../lib/dlps_scraper.js');

describe('DLPS Catalog DB & Scraper', () => {
  let testDb;
  const testDbDir = path.resolve(__dirname, './scratch');
  const testDbPath = path.resolve(testDbDir, 'test_dlps_catalog.db');

  beforeEach(() => {
    if (!fs.existsSync(testDbDir)) {
      fs.mkdirSync(testDbDir, { recursive: true });
    }
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
    testDb = getDb(testDbPath);
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
    }
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch {}
    }
  });

  it('debe inferir tags automáticamente basados en palabras clave', () => {
    assert.ok(inferTags('It Takes Two').includes('coop'));
    assert.ok(inferTags('Unravel Two').includes('coop'));
    assert.ok(inferTags('Haven Romance Story').includes('romance'));
    assert.ok(inferTags('Sailor Moon SuperS').includes('anime'));
    assert.ok(inferTags('Crash Team Racing').includes('racing'));
    assert.ok(inferTags('Gran Turismo 7').includes('racing'));
    assert.ok(inferTags('Tekken 8').includes('fighting'));
  });

  it('debe limpiar títulos correctamente', () => {
    assert.equal(cleanTitle('1. [DLPSGAME.COM] Spider-Man'), 'Spider-Man');
    assert.equal(cleanTitle('45.   Crash Bandicoot  '), 'Crash Bandicoot');
  });

  it('debe extraer el slug de la URL', () => {
    assert.equal(extractSlug('https://dlpsgame.com/it-takes-two-ps4-pkg/'), 'it-takes-two-ps4-pkg');
  });

  it('debe insertar y buscar juegos en la base de datos', () => {
    const mockGames = [
      {
        title: 'It Takes Two',
        url: 'https://dlpsgame.com/it-takes-two-ps4-pkg/',
        platform: 'ps4',
        tags: 'coop,adventure'
      },
      {
        title: 'Haven',
        url: 'https://dlpsgame.com/haven-ps5/',
        platform: 'ps5',
        tags: 'coop,romance'
      },
      {
        title: 'Crash Team Racing Nitro Fueled',
        url: 'https://dlpsgame.com/crash-team-racing-ps4/',
        platform: 'ps4',
        tags: 'racing,kids_family'
      }
    ];

    const inserted = upsertBatch(mockGames, testDb);
    assert.equal(inserted, 3);

    const stats = getStats(testDb);
    assert.equal(stats.total, 3);
    assert.equal(stats.ps4, 2);
    assert.equal(stats.ps5, 1);

    const searchCoop = searchGames({ query: 'two' }, testDb);
    assert.equal(searchCoop.length, 1);
    assert.equal(searchCoop[0].title, 'It Takes Two');

    const searchPs5 = searchGames({ platform: 'ps5' }, testDb);
    assert.equal(searchPs5.length, 1);
    assert.equal(searchPs5[0].title, 'Haven');
  });

  it('debe parsear listas markdown correctamente', () => {
    const sampleMd = `
      1. [#KILLALLZOMBIES](https://dlpsgame.com/killallzombies-ps4-download-free/)
      2. [0 Degrees](https://dlpsgame.com/0-degrees-ps4-pkg/)
      3. [Unravel Two](https://dlpsgame.com/unravel-two-ps4-pkg/)
    `;
    const parsed = parseGameList(sampleMd, 'ps4');
    assert.equal(parsed.length, 3);
    assert.equal(parsed[2].title, 'Unravel Two');
    assert.equal(parsed[2].platform, 'ps4');
    assert.ok(parsed[2].tags.includes('coop'));
  });
});
