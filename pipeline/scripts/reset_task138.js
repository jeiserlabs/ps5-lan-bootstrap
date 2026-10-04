const fs = require('fs');
const { execSync, spawn } = require('child_process');

const tempDir = 'C:\\Users\\dev\\AppData\\Roaming\\IDM\\DwnlData\\dev\\M_43942_v1.00_-5B11._138';

try {
  // 1. Delete temp chunks of corrupted part4
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log('✅ Cleared corrupted temp chunks for task 138');
  }

  // 2. Reset registry values for task 138
  execSync('reg add "HKCU\\Software\\DownloadManager\\138" /v Downloaded /t REG_NONE /d 0000000000000000 /f');
  execSync('reg add "HKCU\\Software\\DownloadManager\\138" /v Status /t REG_DWORD /d 2 /f'); // 2 = queued
  execSync('reg add "HKCU\\Software\\DownloadManager\\138" /v dwnlrs /t REG_DWORD /d 0 /f');
  execSync('reg add "HKCU\\Software\\DownloadManager\\138" /v lastResult /t REG_SZ /d "" /f');
  console.log('✅ Reset registry for task 138');

  // 3. Put 138 in queue
  const q = '138 141 142 143 152 153 154 155 156 161 162 145 148 157 160';
  execSync(`reg add "HKCU\\Software\\DownloadManager\\Queue" /v Queue /t REG_SZ /d "${q}" /f`);
  
  // 4. Resume queue
  const IDM_EXE = 'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe';
  spawn(IDM_EXE, ['/s'], { detached: true, stdio: 'ignore' }).unref();
  console.log('✅ Kicked IDM to re-download fresh part4.rar');
} catch (e) {
  console.error('Error:', e.message);
}
