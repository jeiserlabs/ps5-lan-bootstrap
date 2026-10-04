const { execSync, spawn } = require('child_process');

try {
  // 1. Max connections per download -> 16 (0x10)
  execSync('reg add "HKCU\\Software\\DownloadManager" /v MaxConnectionsNumber /t REG_DWORD /d 16 /f');
  console.log('✅ MaxConnectionsNumber set to 16 per file');

  // 2. Simultaneous downloads in queue -> 8 (0x8)
  execSync('reg add "HKCU\\Software\\DownloadManager\\Queue" /v FilesAtTheSameTime /t REG_DWORD /d 8 /f');
  console.log('✅ FilesAtTheSameTime set to 8 simultaneous files');

  // 3. Queue with all MediaFire tasks:
  // 138 (MLB Base 4), 142 (MLB Upd 2), 143 (MLB Upd 3), 152-156 (Tsushima), 161-162 (GoW Upd)
  const allMfQueue = '138 142 143 152 153 154 155 156 161 162 145 148 157 160';
  execSync(`reg add "HKCU\\Software\\DownloadManager\\Queue" /v Queue /t REG_SZ /d "${allMfQueue}" /f`);
  console.log('✅ Queue updated with all MediaFire tasks in parallel');

  // 4. Kick queue in IDM
  const IDM_EXE = 'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe';
  spawn(IDM_EXE, ['/s'], { detached: true, stdio: 'ignore' }).unref();
  console.log('✅ IDMan /s dispatched at full throttle');
} catch (e) {
  console.error('Error:', e.message);
}
