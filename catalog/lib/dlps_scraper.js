'use strict';

const https = require('https');
const http = require('http');

const URLS = {
  PS4_LIST: 'https://dlpsgame.com/list-all-game-ps4/',
  PS5_LIST: 'https://dlpsgame.com/list-game-ps5/'
};

const TAG_PATTERNS = [
  { tag: 'coop', regex: /\b(co-?op|two|together|overcooked|a way out|unravel|sackboy|rayman|lego|moving out|brothers|lovers|trine|knack|cuphead|haven|split)\b/i },
  { tag: 'anime', regex: /\b(inuyasha|sailor moon|naruto|dragon ball|one piece|bleach|demon slayer|attack on titan|sword art|jojo|hero academia|fairy tail|persona|genshin|guilty gear|tales of|atelier|danganronpa|fate|berserk|gundam)\b/i },
  { tag: 'kids_family', regex: /\b(lego|disney|paw patrol|peppa|sonic|crash|spyro|ratchet|sponge|smurfs|cars|astro|ben 10|gigantosaurus|my little pony|barbie)\b/i },
  { tag: 'romance', regex: /\b(haven|florence|catherine|clannad|doki doki|steins gate|coffee talk|dating|love|otome|romance)\b/i },
  { tag: 'sports', regex: /\b(fifa|fc \d+|pes|efootball|nba|mlb|the show|wwe|madden|tony hawk|pga|ufc|nhl|golf|tennis|skate)\b/i },
  { tag: 'racing', regex: /\b(need for speed|gran turismo|f1|wrc|dirt|grid|ride|motogp|burnout|hot wheels|asphalt|rally|kart|racing)\b/i },
  { tag: 'horror', regex: /\b(resident evil|silent hill|outlast|evil within|dead space|amnesia|alien isolation|until dawn|five nights|fnaf|layers of fear|tormented)\b/i },
  { tag: 'fighting', regex: /\b(tekken|street fighter|mortal kombat|injustice|king of fighters|kof|dragon ball fighterz|smash|soulcalibur|guilty gear)\b/i },
  { tag: 'action_adventure', regex: /\b(god of war|spider-man|spiderman|batman|uncharted|tomb raider|horizon|ghost of tsushima|assassin|witcher|elden ring|dark souls|bloodborne|sekiro|gta|red dead|cyberpunk|monster hunter)\b/i }
];

function inferTags(title) {
  const matched = [];
  for (const { tag, regex } of TAG_PATTERNS) {
    if (regex.test(title)) {
      matched.push(tag);
    }
  }
  return matched.join(',');
}

function fetchUrl(targetUrl, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const client = targetUrl.startsWith('https') ? https : http;
    const req = client.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} loading ${targetUrl}`));
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${targetUrl}`));
    });

    req.on('error', err => reject(err));
  });
}

function parseGameList(content, platform) {
  const games = [];
  const seenUrls = new Set();

  // Pattern 1: Markdown style: N. [Title](URL)
  const mdRegex = /^\s*\d+\.\s*\[(.*?)\]\((https?:\/\/dlpsgame\.com\/[^)\s]+)\)/gm;
  let match;
  while ((match = mdRegex.exec(content)) !== null) {
    const title = cleanTitle(match[1]);
    const url = match[2].trim();
    if (title && url && !seenUrls.has(url)) {
      seenUrls.add(url);
      games.push({
        title,
        url,
        platform: platform.toLowerCase(),
        tags: inferTags(title)
      });
    }
  }

  // Pattern 2: Raw HTML style: <a href="https://dlpsgame.com/...">Title</a>
  if (games.length === 0) {
    const htmlRegex = /<a\s+[^>]*href=["'](https?:\/\/dlpsgame\.com\/[^"']+)["'][^>]*>(.*?)<\/a>/gi;
    while ((match = htmlRegex.exec(content)) !== null) {
      const url = match[1].trim();
      const rawText = match[2].replace(/<[^>]+>/g, '').trim();
      const title = cleanTitle(rawText);

      if (isValidGameEntry(title, url) && !seenUrls.has(url)) {
        seenUrls.add(url);
        games.push({
          title,
          url,
          platform: platform.toLowerCase(),
          tags: inferTags(title)
        });
      }
    }
  }

  return games;
}

function cleanTitle(str) {
  if (!str) return '';
  return str
    .replace(/^[\d\s.\-–—]+/, '')
    .replace(/\[DLPSGAME\.COM\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidGameEntry(title, url) {
  if (!title || title.length < 2) return false;
  if (/^(home|ps4|ps5|ps3|ps2|pc|switch|contact|dmca|privacy|about|login|register|daily update|list all|all game)/i.test(title)) {
    return false;
  }
  if (/\/category\/|\/tag\/|\/page\/|\/author\/|wp-login/i.test(url)) {
    return false;
  }
  return true;
}

async function scrapePlatformList(platform, customContent = null) {
  const plat = platform.toLowerCase();
  const url = plat === 'ps5' ? URLS.PS5_LIST : URLS.PS4_LIST;

  let raw = customContent;
  if (!raw) {
    raw = await fetchUrl(url);
  }

  return parseGameList(raw, plat);
}

module.exports = {
  URLS,
  inferTags,
  fetchUrl,
  parseGameList,
  scrapePlatformList,
  cleanTitle
};
