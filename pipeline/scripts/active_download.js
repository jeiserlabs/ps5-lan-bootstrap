const fs = require('fs');
const path = require('path');

const baseDir = 'C:\\Users\\dev\\AppData\\Roaming\\IDM\\DwnlData\\dev';
try {
  const dirs = fs.readdirSync(baseDir);
  const now = Date.now();
  for (const d of dirs) {
    const full = path.join(baseDir, d);
    try {
      const stats = fs.statSync(full);
      if (stats.isDirectory()) {
        const files = fs.readdirSync(full);
        for (const f of files) {
          const fpath = path.join(full, f);
          const fstat = fs.statSync(fpath);
          const ageSec = (now - fstat.mtimeMs) / 1000;
          if (ageSec < 120) {
            console.log(`ACTIVE: Folder: ${d} | File: ${f} | Size: ${(fstat.size / (1024*1024)).toFixed(2)} MB | Modified ${ageSec.toFixed(1)}s ago`);
          }
        }
      }
    } catch {}
  }
} catch (e) {
  console.error(e.message);
}
