const { execSync, spawn } = require('child_process');

try {
  const q = '138 139 141 142 143 152 153 154 155 156 161 162 145 148 157 160';
  execSync(`reg add "HKCU\\Software\\DownloadManager\\Queue" /v Queue /t REG_SZ /d "${q}" /f`);
  console.log('✅ Added 138 to queue front!');
  
  const IDM_EXE = 'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe';
  spawn(IDM_EXE, ['/s'], { detached: true, stdio: 'ignore' }).unref();
  console.log('✅ IDMan /s dispatched!');
} catch (e) {
  console.error('Error:', e.message);
}
