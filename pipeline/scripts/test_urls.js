const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

function getProp(id, prop) {
  try {
    const q = execSync(`reg query "HKCU\\Software\\DownloadManager\\${id}" /v ${prop}`, { encoding: 'utf8' });
    const m = q.match(new RegExp(`${prop}\\s+REG_[^\\s]+\\s+([^\\r\\n]+)`, 'i'));
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

async function testUrl(name, url) {
  if (!url) {
    console.log(`[${name}] No URL found`);
    return;
  }
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const mod = u.protocol === 'https:' ? https : http;
      const req = mod.request(u, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
        console.log(`[${name}] HTTP Status: ${res.statusCode} | Content-Length: ${res.headers['content-length']} | Location: ${res.headers['location'] || 'none'}`);
        resolve();
      });
      req.on('error', (err) => {
        console.log(`[${name}] Network Error: ${err.message}`);
        resolve();
      });
      req.setTimeout(8000, () => {
        console.log(`[${name}] Timeout`);
        req.destroy();
        resolve();
      });
      req.end();
    } catch (e) {
      console.log(`[${name}] Invalid URL: ${e.message}`);
      resolve();
    }
  });
}

async function main() {
  const akiraUrl = getProp('145', 'Url0') || getProp('145', 'Url');
  const mfUrl = getProp('135', 'Url0') || getProp('135', 'Url');
  console.log('Testing AkiraBox 145:', akiraUrl ? akiraUrl.substring(0, 80) : 'none');
  await testUrl('AkiraBox (145)', akiraUrl);

  console.log('Testing MediaFire 135:', mfUrl ? mfUrl.substring(0, 80) : 'none');
  await testUrl('MediaFire (135)', mfUrl);
}

main();
