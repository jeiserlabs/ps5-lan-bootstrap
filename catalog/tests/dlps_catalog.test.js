import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { getDb, upsertBatch, searchGames, getStats, setMeta, extractSlug } from '../lib/games/dlps_db.js';
import { inferTags, cleanTitle, parseGameList } from '../lib/games/dlps_scraper.js';

describe('DLPS Catalog DB & Scraper', () => {
  let testDb;
  const testDbPath = path.resolve(__dirname, './scratch/test_dlps_catalog.db');

  beforeEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    testDb = getDb(testDbPath);
  });

  afterEach(() => {
    if (testDb) {
      testDb.close();
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('debe inferir tags automáticamente basados en palabras clave', () => {
    expect(inferTags('It Takes Two')).toContain('coop');
    expect(inferTags('Unravel Two')).toContain('coop');
    expect(inferTags('Haven Romance Story')).toContain('romance');
    expect(inferTags('Sailor Moon SuperS')).toContain('anime');
    expect(inferTags('Crash Team Racing')).toContain('racing');
    expect(inferTags('Gran Turismo 7')).toContain('racing');
    expect(inferTags('Tekken 8')).toContain('fighting');
  });

  it('debe limpiar títulos correctamente', () => {
    expect(cleanTitle('1. [DLPSGAME.COM] Spider-Man')).toBe('Spider-Man');
    expect(cleanTitle('45.   Crash Bandicoot  ')).toBe('Crash Bandicoot');
  });

  it('debe extraer el slug de la URL', () => {
    expect(extractSlug('https://dlpsgame.com/it-takes-two-ps4-pkg/')).toBe('it-takes-two-ps4-pkg');
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
    expect(inserted).toBe(3);

    const stats = getStats(testDb);
    expect(stats.total).toBe(3);
    expect(stats.ps4).toBe(2);
    expect(stats.ps5).toBe(1);

    const searchCoop = searchGames({ query: 'two' }, testDb);
    expect(searchCoop.length).toBe(1);
    expect(searchCoop[0].title).toBe('It Takes Two');

    const searchPs5 = searchGames({ platform: 'ps5' }, testDb);
    expect(searchPs5.length).toBe(1);
    expect(searchPs5[0].title).toBe('Haven');
  });

  it('debe parsear listas markdown correctamente', () => {
    const sampleMd = `
      1. [#KILLALLZOMBIES](https://dlpsgame.com/killallzombies-ps4-download-free/)
      2. [0 Degrees](https://dlpsgame.com/0-degrees-ps4-pkg/)
      3. [Unravel Two](https://dlpsgame.com/unravel-two-ps4-pkg/)
    `;
    const parsed = parseGameList(sampleMd, 'ps4');
    expect(parsed.length).toBe(3);
    expect(parsed[2].title).toBe('Unravel Two');
    expect(parsed[2].platform).toBe('ps4');
    expect(parsed[2].tags).toContain('coop');
  });
});
