const { execSync } = require('child_process');

try {
  const out = execSync('reg query HKCU\\Software\\DownloadManager', { encoding: 'utf8' });
  const subkeys = out.split('\r\n').filter(l => /DownloadManager\\\d+$/.test(l.trim()));

  console.log(`=== AUDITORIA COMPLETA DE DESCARGAS IDM (${subkeys.length} tareas) ===\n`);

  for (const subkey of subkeys) {
    const trimmed = subkey.trim();
    const id = trimmed.split('\\').pop();
    let q = '';
    try {
      q = execSync(`reg query "${trimmed}"`, { encoding: 'utf8' });
    } catch {
      continue;
    }

    const getVal = (name) => {
      const regex = new RegExp(`\\s+${name}\\s+REG_[^\\s]+\\s+([^\\r\\n]+)`, 'i');
      const m = q.match(regex);
      return m ? m[1].trim() : '';
    };

    const fn = getVal('FileName');
    const host = getVal('Host');
    const lastResult = getVal('lastResult');
    const dwnlrs = getVal('dwnlrs');
    const speed = getVal('Speed');
    const status = getVal('Status');
    const owWPage = getVal('owWPage');
    
    // Check if there is multiline lastResult:
    let fullLastResult = '';
    const lrMatch = q.match(/lastResult\s+REG_SZ\s+([\s\S]*?)(?=\r?\n\s+[A-Za-z0-9_]+\s+REG_|$)/);
    if (lrMatch) {
      fullLastResult = lrMatch[1].trim().replace(/\r?\n/g, ' ');
    }

    const baseName = fn ? fn.split('\\').pop() : '(sin nombre)';
    console.log(`[Task ${id}] ${baseName}`);
    console.log(`   Host: ${host} | dwnlrs: ${dwnlrs} | Speed: ${speed}`);
    if (fullLastResult) {
      console.log(`   ❌ ERROR: ${fullLastResult}`);
    }
    if (owWPage) {
      console.log(`   🔗 Web: ${owWPage}`);
    }
    console.log('');
  }
} catch (e) {
  console.error('Error querying registry:', e.message);
}
