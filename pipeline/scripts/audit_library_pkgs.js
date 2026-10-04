const fs = require('fs');
const path = require('path');
const { validatePkg } = require('../lib/pkg_validator');

function scanDir(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      scanDir(full, results);
    } else if (item.endsWith('.pkg')) {
      results.push({ path: full, size: stat.size, name: item });
    }
  }
  return results;
}

const libs = ['C:\\Biblioteca_Juegos_PS', 'E:\\Biblioteca_Juegos_PS'];
let allPkgs = [];
for (const lib of libs) {
  allPkgs = allPkgs.concat(scanDir(lib));
}

console.log(`Auditing ${allPkgs.length} PKG files on disk...\n`);
let validCount = 0;
let corruptCount = 0;

for (const pkg of allPkgs) {
  const res = validatePkg(pkg.path);
  const sizeGB = (pkg.size / (1024*1024*1024)).toFixed(2);
  if (res.valid) {
    validCount++;
    console.log(`✅ [OK] ${res.sfo?.titleId || 'PKG'} | ${res.sfo?.title || pkg.name} | ${sizeGB} GB`);
  } else {
    corruptCount++;
    console.log(`❌ [CORRUPT] ${pkg.name}: ${res.errors.join(', ')}`);
  }
}

console.log(`\n=== RESUMEN AUDITORIA FORENSE ===`);
console.log(`Total PKGs verificados: ${allPkgs.length}`);
console.log(`Archivos 100% íntegros y válidos: ${validCount}`);
console.log(`Archivos corruptos: ${corruptCount}`);
