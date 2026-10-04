const { execSync, spawn } = require('child_process');

const tasks = ['138', '142', '143', '152', '153', '154', '155', '156', '161', '162'];

console.log('Resetting error flags on all MediaFire tasks...');
for (const id of tasks) {
  try {
    execSync(`reg add "HKCU\\Software\\DownloadManager\\${id}" /v dwnlrs /t REG_DWORD /d 0 /f`);
    execSync(`reg add "HKCU\\Software\\DownloadManager\\${id}" /v lastResult /t REG_SZ /d "" /f`);
    execSync(`reg add "HKCU\\Software\\DownloadManager\\${id}" /v Status /t REG_DWORD /d 0 /f`);
    execSync(`reg add "HKCU\\Software\\DownloadManager\\${id}" /v queueID /t REG_DWORD /d 1 /f`);
    console.log(`✅ Reset task ${id}`);
  } catch (e) {
    console.error(`Task ${id} err:`, e.message);
  }
}

// Ensure 8 files at the same time:
execSync('reg add "HKCU\\Software\\DownloadManager\\Queue" /v FilesAtTheSameTime /t REG_DWORD /d 8 /f');

// Queue string with all tasks:
const q = tasks.join(' ') + ' 145 148 157 160';
execSync(`reg add "HKCU\\Software\\DownloadManager\\Queue" /v Queue /t REG_SZ /d "${q}" /f`);
console.log('✅ Updated Queue in registry with 8 concurrent files');

// Kick queue in IDM
const IDM_EXE = 'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe';
spawn(IDM_EXE, ['/s'], { detached: true, stdio: 'ignore' }).unref();
console.log('✅ IDMan /s dispatched!');
