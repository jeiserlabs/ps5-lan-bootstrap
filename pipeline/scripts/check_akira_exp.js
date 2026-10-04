const { execSync } = require('child_process');

const tasks = ['145', '148', '157', '160'];
for (const id of tasks) {
  try {
    const q = execSync(`reg query HKCU\\Software\\DownloadManager\\${id}`, { encoding: 'utf8' });
    const getVal = (name) => {
      const m = q.match(new RegExp(`${name}\\s+REG_[^\\s]+\\s+([^\\r\\n]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const fn = getVal('FileName');
    const u0 = getVal('Url0');
    console.log(`Task ${id}: ${fn.substring(0, 50)}`);
    const expMatch = u0.match(/expiration=(\d+)/);
    if (expMatch) {
      const expDate = new Date(parseInt(expMatch[1]) * 1000);
      console.log(`   Expiration: ${expDate.toISOString()} | Expired: ${Date.now() > expDate.getTime()}`);
    } else {
      console.log(`   Url0: ${u0.substring(0, 70)}`);
    }
  } catch (e) {
    console.log(`Task ${id} error:`, e.message);
  }
}
