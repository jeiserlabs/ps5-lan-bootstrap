const { execSync, spawn } = require('child_process');
const fs = require('fs');

console.log('=== INICIANDO RECUPERACIÓN TRAS EL CORTE ===');

// 1. Limpiar flags de error en las tareas de IDM
const tasks = ['138', '141', '142', '143', '145', '148', '156', '157', '160', '161', '162'];
for (const id of tasks) {
  try {
    execSync(`reg add "HKCU\\Software\\DownloadManager\\${id}" /v dwnlrs /t REG_DWORD /d 0 /f`);
    execSync(`reg add "HKCU\\Software\\DownloadManager\\${id}" /v lastResult /t REG_SZ /d "" /f`);
    execSync(`reg add "HKCU\\Software\\DownloadManager\\${id}" /v Status /t REG_DWORD /d 0 /f`);
  } catch(e) {}
}
console.log('✅ Flags de error reseteados en tareas IDM.');

// 2. Prioridad de cola: 156 (GoT parte 5), 161 (GoW Update 1), 162 (GoW Update 2), 160 (GoW Base), 148 (HFW), 145 (HZD), 138, 141, 142, 143, 157
const queue = '156 161 162 160 148 145 138 141 142 143 157';
try {
  execSync(`reg add "HKCU\\Software\\DownloadManager\\Queue" /v Queue /t REG_SZ /d "${queue}" /f`);
  execSync('reg add "HKCU\\Software\\DownloadManager\\Queue" /v FilesAtTheSameTime /t REG_DWORD /d 8 /f');
  console.log('✅ Cola IDM reconfigurada a 8 descargas simultáneas.');
} catch(e) {}

// 3. Iniciar IDM
const IDM_EXE = 'C:\\Program Files (x86)\\Internet Download Manager\\IDMan.exe';
if (fs.existsSync(IDM_EXE)) {
  spawn(IDM_EXE, [], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => {
    spawn(IDM_EXE, ['/s'], { detached: true, stdio: 'ignore' }).unref();
    console.log('✅ IDMan.exe lanzado y cola /s ejecutada.');
  }, 2000);
}
