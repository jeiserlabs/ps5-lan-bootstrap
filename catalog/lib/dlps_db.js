'use strict';

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DEFAULT_DB_PATH = path.resolve(__dirname, '../../data/games_catalog.db');

function getDb(customPath = null) {
  const dbPath = customPath || DEFAULT_DB_PATH;
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  initSchema(db);
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      platform TEXT NOT NULL,
      url TEXT NOT NULL,
      cusa TEXT,
      category TEXT,
      tags TEXT,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform);
    CREATE INDEX IF NOT EXISTS idx_games_title ON games(title);
    CREATE INDEX IF NOT EXISTS idx_games_slug ON games(slug);
    CREATE INDEX IF NOT EXISTS idx_games_tags ON games(tags);

    CREATE TABLE IF NOT EXISTS catalog_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ps5_installed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      cusa TEXT,
      platform TEXT NOT NULL,
      size_gb REAL,
      installed_at TEXT DEFAULT (datetime('now')),
      status TEXT NOT NULL,
      usb_drive TEXT,
      notes TEXT
    );
  `);
}

function upsertBatch(items, db) {
  if (!items || items.length === 0) return 0;

  const stmt = db.prepare(`
    INSERT INTO games (title, slug, platform, url, cusa, category, tags, description, updated_at)
    VALUES (@title, @slug, @platform, @url, @cusa, @category, @tags, @description, datetime('now'))
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      platform = excluded.platform,
      url = excluded.url,
      cusa = COALESCE(excluded.cusa, games.cusa),
      category = COALESCE(excluded.category, games.category),
      tags = COALESCE(excluded.tags, games.tags),
      description = COALESCE(excluded.description, games.description),
      updated_at = datetime('now')
  `);

  db.exec('BEGIN');
  let count = 0;
  try {
    for (const g of items) {
      stmt.run({
        '@title': g.title,
        '@slug': g.slug || extractSlug(g.url),
        '@platform': g.platform.toLowerCase(),
        '@url': g.url,
        '@cusa': g.cusa || null,
        '@category': g.category || null,
        '@tags': g.tags || null,
        '@description': g.description || null
      });
      count++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return count;
}

function extractSlug(url) {
  if (!url) return '';
  const clean = url.replace(/\/+$/, '');
  const parts = clean.split('/');
  return parts[parts.length - 1] || clean;
}

function searchGames({ query = '', platform = null, tag = null, limit = 50, offset = 0 } = {}, db) {
  let sql = 'SELECT * FROM games WHERE 1=1';
  const params = {};

  if (platform) {
    sql += ' AND platform = @platform';
    params['@platform'] = platform.toLowerCase();
  }

  if (tag) {
    sql += ' AND tags LIKE @tagPattern';
    params['@tagPattern'] = `%${tag.toLowerCase()}%`;
  }

  if (query && query.trim()) {
    const words = query.trim().split(/\s+/).filter(Boolean);
    words.forEach((w, idx) => {
      const pName = `q_${idx}`;
      sql += ` AND (title LIKE @${pName} OR cusa LIKE @${pName} OR tags LIKE @${pName})`;
      params[`@${pName}`] = `%${w}%`;
    });
  }

  sql += ' ORDER BY title ASC LIMIT @limit OFFSET @offset';
  params['@limit'] = limit;
  params['@offset'] = offset;

  return db.prepare(sql).all(params);
}

function getStats(db) {
  const total = db.prepare('SELECT count(*) as count FROM games').get().count;
  const ps4 = db.prepare("SELECT count(*) as count FROM games WHERE platform = 'ps4'").get().count;
  const ps5 = db.prepare("SELECT count(*) as count FROM games WHERE platform = 'ps5'").get().count;
  const lastSync = db.prepare("SELECT value, updated_at FROM catalog_meta WHERE key = 'last_sync'").get();

  return {
    total: Number(total),
    ps4: Number(ps4),
    ps5: Number(ps5),
    lastSync: lastSync ? { date: lastSync.value, updated_at: lastSync.updated_at } : null
  };
}

function setMeta(key, value, db) {
  db.prepare(`
    INSERT INTO catalog_meta (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(key, String(value));
}

function recordInstalledGame(game, db) {
  const conn = db || getDb();
  const stmt = conn.prepare(`
    INSERT INTO ps5_installed (title, cusa, platform, size_gb, status, usb_drive, notes)
    VALUES (@title, @cusa, @platform, @size_gb, @status, @usb_drive, @notes)
  `);
  return stmt.run({
    '@title': game.title,
    '@cusa': game.cusa || null,
    '@platform': (game.platform || 'ps4').toLowerCase(),
    '@size_gb': game.size_gb || 0,
    '@status': game.status || 'instalando_ps5',
    '@usb_drive': game.usb_drive || null,
    '@notes': game.notes || null
  });
}

function getInstalledGames(db) {
  const conn = db || getDb();
  return conn.prepare('SELECT * FROM ps5_installed ORDER BY installed_at DESC').all();
}

function updateInstalledStatus(cusaOrTitle, newStatus, db) {
  const conn = db || getDb();
  return conn.prepare(`
    UPDATE ps5_installed
    SET status = ?
    WHERE cusa = ? OR title LIKE ?
  `).run(newStatus, cusaOrTitle, `%${cusaOrTitle}%`);
}

module.exports = {
  getDb,
  upsertBatch,
  searchGames,
  getStats,
  setMeta,
  extractSlug,
  getInstalledGames,
  updateInstalledStatus
};
