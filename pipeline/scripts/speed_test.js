const fs = require('fs');

function getChunkSizes() {
  const baseDir = 'C:\\Users\\dev\\AppData\\Roaming\\IDM\\DwnlData\\dev';
  let total = 0;
  if (!fs.existsSync(baseDir)) return 0;
  for (const d of fs.readdirSync(baseDir)) {
    const full = `${baseDir}\\${d}`;
    try {
      if (fs.statSync(full).isDirectory()) {
        for (const f of fs.readdirSync(full)) {
          total += fs.statSync(`${full}\\${f}`).size;
        }
      }
    } catch {}
  }
  return total;
}

const s1 = getChunkSizes();
setTimeout(() => {
  const s2 = getChunkSizes();
  const diffMB = (s2 - s1) / (1024 * 1024);
  const speedMBS = diffMB / 3;
  const speedMbps = speedMBS * 8;
  console.log(`REAL-TIME SPEED: ${speedMBS.toFixed(2)} MB/s (${speedMbps.toFixed(2)} Mbps)`);
}, 3000);
