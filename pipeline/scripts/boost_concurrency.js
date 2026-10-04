const { execSync, spawn } = require('child_process');

try {
  // Set 4 downloads at the same time in Main Queue
  execSync('reg add "HKCU\\Software\\DownloadManager\\Queue" /v FilesAtTheSameTime /t REG_DWORD /d 4 /f');
  console.log('✅ FilesAtTheSameTime set to 4');
  
  // Reorder queue to ensure all MediaFire tasks are in front:
  // Remaining MediaFire: 139, 141, 142, 143, 152, 153, 154, 155, 156, 161, 162
  // Then AkiraBox: 145, 148, 157, 160
  const mfQueue = '139 141 142 143 152 153 154 155 156 161 162 145 148 157 160';
  execSync(`reg add "HKCU\\Software\\DownloadManager\\Queue" /v Queue /t REG_SZ /d "${mfQueue}" /f`);
  console.log('✅ Queue order optimized with MediaFire in parallel');
  
  // Kick queue in IDM
  const IDM_EXE = 'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe';
  spawn(IDM_EXE, ['/s'], { detached: true, stdio: 'ignore' }).unref();
  console.log('✅ IDMan /s launched');
} catch (e) {
  console.error('Error:', e.message);
}
