const { execSync } = require('child_process');

const newQueue = '134 135 136 137 138 139 141 142 143 152 153 154 155 156 161 162 145 148 157 160';

try {
  execSync(`reg add "HKCU\\Software\\DownloadManager\\Queue" /v Queue /t REG_SZ /d "${newQueue}" /f`);
  console.log('Queue reordered successfully!');
  const check = execSync('reg query "HKCU\\Software\\DownloadManager\\Queue" /v Queue', { encoding: 'utf8' });
  console.log(check);
} catch (e) {
  console.error('Error reordering queue:', e.message);
}
