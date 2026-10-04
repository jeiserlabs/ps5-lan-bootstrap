const { execSync } = require('child_process');

function parseHex64(hexStr) {
  if (!hexStr) return 0;
  // Format is little-endian bytes: E1FA9DAC03000000 -> 0x00000003AC9DFAE1
  const clean = hexStr.replace(/\s+/g, '');
  if (clean.length !== 16) return 0;
  let leHex = '';
  for (let i = 14; i >= 0; i -= 2) {
    leHex += clean.substring(i, i + 2);
  }
  return Number(BigInt('0x' + leHex));
}

const tasks = ['145', '148', '157', '160'];
for (const id of tasks) {
  try {
    const q = execSync(`reg query HKCU\\Software\\DownloadManager\\${id}`, { encoding: 'utf8' });
    const getVal = (name) => {
      const m = q.match(new RegExp(`${name}\\s+REG_[^\\s]+\\s+([^\\r\\n]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const fn = getVal('FileName');
    const fsizeRaw = getVal('FileSize');
    const dwnlRaw = getVal('Downloaded');
    const fsize = parseHex64(fsizeRaw);
    const dwnl = parseHex64(dwnlRaw);
    console.log(`Task ${id}:`);
    console.log(`   File: ${fn.substring(0, 50)}`);
    console.log(`   Progress: ${(dwnl / (1024*1024*1024)).toFixed(2)} GB / ${(fsize / (1024*1024*1024)).toFixed(2)} GB (${fsize ? ((dwnl/fsize)*100).toFixed(1) : 0}%)`);
  } catch (e) {
    console.log(`Task ${id} err:`, e.message);
  }
}
