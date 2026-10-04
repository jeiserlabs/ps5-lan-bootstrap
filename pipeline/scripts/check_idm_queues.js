const { execSync } = require('child_process');

try {
  const qList = execSync('reg query HKCU\\Software\\DownloadManager /s /f queue', { encoding: 'utf8' });
  console.log(qList.substring(0, 1500));
} catch (e) {
  console.error(e.message);
}
