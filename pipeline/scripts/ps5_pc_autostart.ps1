# ps5_pc_autostart.ps1
# Arranque automatico del lado PC para el pipeline PS5 (se llama desde la tarea
# programada "PS5_PC_Pipeline" al iniciar sesion de Windows).
#   1. Servidor LAN de PKGs (server.js, puerto 9898)   - si no responde /healthz
#   2. Watchdog del jailbreak (kstuff_watchdog.js)     - si no hay pid vivo
# Idempotente: si algo ya esta corriendo, no lo duplica (respeta pidfiles).
# Log: data/logs/ps5_pc_autostart.log

$ErrorActionPreference = 'Continue'
$root     = 'E:\ps5'
$log      = Join-Path $root 'data\logs\ps5_pc_autostart.log'
$nodeExe  = 'C:\Program Files\nodejs\node.exe'

function Write-Log([string]$msg) {
  $line = ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
  try {
    New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null
    Add-Content -Path $log -Value $line -Encoding UTF8
  } catch {}
  try { Add-Content -Path (Join-Path $root 'data\logs\ps5_pipeline.log') -Value ("[{0}] [PC_AUTOSTART] {1}" -f (Get-Date -Format o), $msg) -Encoding UTF8 } catch {}
}

function Test-HttpOk([string]$url, [int]$timeoutSec = 3) {
  try {
    $r = Invoke-WebRequest -Uri $url -TimeoutSec $timeoutSec -UseBasicParsing
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

function Test-PidAlive([string]$pidFile) {
  try {
    $pidValue = (Get-Content $pidFile -ErrorAction Stop | Select-Object -First 1).Trim()
    if (-not $pidValue) { return $false }
    return $null -ne (Get-Process -Id ([int]$pidValue) -ErrorAction SilentlyContinue)
  } catch { return $false }
}

function Start-HiddenNode([string]$scriptPath) {
  Start-Process -FilePath $nodeExe -ArgumentList "`"$scriptPath`"" `
    -WorkingDirectory $root -WindowStyle Hidden
}

Write-Log '=== inicio de sesion detectado: verificando pipeline PC ==='

# 1) Servidor LAN de PKGs (9898)
if (Test-HttpOk 'http://192.168.2.1:9898/healthz') {
  Write-Log 'Servidor LAN 9898: ya activo, no se duplica.'
} else {
  Start-HiddenNode (Join-Path $root 'pipeline\scripts\server.js')
  $up = $false
  for ($i = 0; $i -lt 15; $i++) {
    Start-Sleep -Milliseconds 700
    if (Test-HttpOk 'http://192.168.2.1:9898/healthz' 2) { $up = $true; break }
  }
  Write-Log ("Servidor LAN 9898: {0}" -f $(if ($up) { 'levantado OK' } else { 'FALLO al levantar (revisar server.log)' }))
}

# 2) Watchdog del jailbreak
$wdPid = Join-Path $root 'data\cache\ps5\kstuff_watchdog.pid'
if (Test-PidAlive $wdPid) {
  Write-Log 'Watchdog jailbreak: ya activo, no se duplica.'
} else {
  Start-HiddenNode (Join-Path $root 'pipeline\scripts\kstuff_watchdog.js')
  Start-Sleep -Seconds 2
  $alive = Test-PidAlive $wdPid
  Write-Log ("Watchdog jailbreak: {0}" -f $(if ($alive) { 'levantado OK' } else { 'FALLO al levantar (revisar kstuff_watchdog.log)' }))
}

# 2b) Piloto de descargas aria2c (era post-IDM, 5-oct-2026)
$ariaPid = Join-Path $root 'data\cache\ps5\aria_pilot.pid'
if (Test-PidAlive $ariaPid) {
  Write-Log 'Piloto aria2c: ya activo, no se duplica.'
} else {
  Start-HiddenNode (Join-Path $root 'pipeline\scripts\aria_pilot.js')
  Start-Sleep -Seconds 3
  $alive = Test-PidAlive $ariaPid
  Write-Log ("Piloto aria2c: {0}" -f $(if ($alive) { 'levantado OK' } else { 'FALLO al levantar (revisar aria_pilot.log)' }))
}

# 3) Host del exploit (DNS+HTTPS 100% local: manuals.playstation.net -> 192.168.2.1)
#    Sin el, la app WebKit Autoloader no carga pagina tras un reinicio de la PS5.
$hostProc = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'webkit-autoloader-host' }
if ($hostProc) {
  Write-Log 'Host exploit DNS+HTTPS: proceso python ya activo, no se duplica.'
} else {
  $hostDir = Join-Path $root 'ps5-host'
  Start-Process -FilePath 'C:\Python314\python.exe' `
    -ArgumentList '-X','utf8','webkit-autoloader-host_v0.5.2.py','--ip','192.168.2.1','--no-update-check','--verbose' `
    -WorkingDirectory $hostDir -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $hostDir 'host.log') `
    -RedirectStandardError  (Join-Path $hostDir 'host.err')
  $up = $false
  for ($i = 0; $i -lt 12; $i++) {
    Start-Sleep -Milliseconds 800
    try {
      $t2 = New-Object Net.Sockets.TcpClient
      $t2.ConnectAsync('192.168.2.1', 443).Wait(1500) | Out-Null
      $up = $t2.Connected; $t2.Close()
      if ($up) { break }
    } catch {}
  }
  Write-Log ("Host exploit DNS+HTTPS: {0}" -f $(if ($up) { 'levantado OK' } else { 'FALLO al levantar (revisar ps5-host\host.err)' }))
}

Write-Log '=== autostart PC completado ==='
