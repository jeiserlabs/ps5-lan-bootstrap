const fs = require('fs');
const path = require('path');

const libs = ['C:\\Biblioteca_Juegos_PS', 'E:\\Biblioteca_Juegos_PS'];
const games = [];

for (const lib of libs) {
  if (!fs.existsSync(lib)) continue;
  for (const item of fs.readdirSync(lib)) {
    const full = path.join(lib, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      let totalBytes = 0;
      let pkgs = [];
      for (const f of fs.readdirSync(full)) {
        if (f.endsWith('.pkg')) {
          const s = fs.statSync(path.join(full, f)).size;
          totalBytes += s;
          pkgs.push({ name: f, sizeGB: (s / (1024*1024*1024)).toFixed(2) });
        }
      }
      if (pkgs.length > 0) {
        games.push({
          folder: item,
          drive: lib.substring(0, 2),
          totalGB: (totalBytes / (1024*1024*1024)).toFixed(2),
          pkgCount: pkgs.length
        });
      }
    }
  }
}

console.log('=== JUEGOS Y ARCHIVOS YA 100% LISTOS EN PC ===\n');
let sum = 0;
for (const g of games) {
  sum += parseFloat(g.totalGB);
  console.log(`[${g.drive}] ${g.folder}: ${g.totalGB} GB (${g.pkgCount} PKG)`);
}
console.log(`\nTOTAL LISTO EN PC: ${sum.toFixed(2)} GB`);
