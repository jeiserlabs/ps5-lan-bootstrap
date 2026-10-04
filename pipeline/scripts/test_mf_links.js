const { execSync } = require('child_process');
const https = require('https');

const mfTasks = ['135', '136', '137', '138', '139', '141', '142', '143', '152', '153', '154', '155', '156', '161', '162'];

async function testHead(id, url) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = https.request(u, { method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
        resolve({ id, status: res.statusCode, length: res.headers['content-length'] });
      });
      req.on('error', (err) => resolve({ id, error: err.message }));
      req.setTimeout(6000, () => { req.destroy(); resolve({ id, error: 'timeout' }); });
      req.end();
    } catch (e) {
      resolve({ id, error: e.message });
    }
  });
}

async function run() {
  for (const id of mfTasks) {
    try {
      const q = execSync(`reg query HKCU\\Software\\DownloadManager\\${id} /v Url0`, { encoding: 'utf8' });
      const m = q.match(/Url0\s+REG_SZ\s+([^\r\n]+)/i);
      if (m) {
        const res = await testHead(id, m[1].trim());
        const sizeGB = res.length ? (parseInt(res.length) / (1024*1024*1024)).toFixed(2) + ' GB' : '';
        console.log(`Task ${id} | HTTP: ${res.status || 'ERR: ' + res.error} | Size: ${sizeGB}`);
      }
    } catch {}
  }
}

run();
