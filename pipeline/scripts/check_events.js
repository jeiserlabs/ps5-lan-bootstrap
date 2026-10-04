const { execSync } = require('child_process');

try {
  const psCmd = `Get-WinEvent -FilterHashtable @{LogName='Application'} -MaxEvents 200 | Where-Object { $_.Message -like '*IDMan*' } | Select-Object -Property TimeCreated, Id, Message | Format-List`;
  const res = execSync(`powershell -NoProfile -Command "${psCmd}"`, { encoding: 'utf8' });
  console.log(res.trim() ? res : 'No events matching IDMan in the last 200 events.');
} catch (e) {
  console.log('Error:', e.message);
}
