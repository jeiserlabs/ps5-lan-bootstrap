<#
.SYNOPSIS
    adb_auto_tether.ps1 - Auto-activador desatendido de USB Tethering via ADB para Redmi Note 8 Pro.
.DESCRIPTION
    Monitorea la conexión del teléfono por ADB. Siempre que el teléfono se conecte al PC,
    fuerza automáticamente la activación de RNDIS (USB Tethering) si no está activo.
    Puede instalarse como Tarea Programada de Windows para arrancar automáticamente con la PC.
.PARAMETER Action
    Run (ejecuta el bucle de monitoreo continuo)
    Once (ejecuta una sola comprobación y activa si es necesario)
    InstallTask (instala la tarea programada en Windows)
    UninstallTask (elimina la tarea programada)
#>
[CmdletBinding()]
param(
    [ValidateSet("Run", "Once", "InstallTask", "UninstallTask")]
    [string]$Action = "Run",

    [int]$IntervalSeconds = 5
)

$ErrorActionPreference = "Continue"
$AdbPath = "C:\Users\dev\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$LogPath = "E:\ps5\data\logs\adb_auto_tether.log"
$TaskName = "PS5_AdbAutoTether"

function Log-Adb([string]$msg) {
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$ts] $msg"
    Write-Host $line
    $logDir = Split-Path $LogPath
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    Add-Content -Path $LogPath -Value $line -ErrorAction SilentlyContinue
}

function Invoke-AdbRaw([string]$argsString) {
    $tempErr = [System.IO.Path]::GetTempFileName()
    $tempOut = [System.IO.Path]::GetTempFileName()
    try {
        $p = Start-Process -FilePath $AdbPath -ArgumentList $argsString -NoNewWindow -Wait -PassThru -RedirectStandardError $tempErr -RedirectStandardOutput $tempOut
        $errText = Get-Content $tempErr -Raw -ErrorAction SilentlyContinue
        $outText = Get-Content $tempOut -Raw -ErrorAction SilentlyContinue
        return ("$outText`n$errText").Trim()
    } finally {
        Remove-Item $tempErr, $tempOut -ErrorAction SilentlyContinue
    }
}

function Ensure-RndisTether {
    if (-not (Test-Path $AdbPath)) {
        Log-Adb "ERROR: adb.exe no encontrado en $AdbPath"
        return $false
    }

    # Comprobar si hay dispositivo conectado y autorizado
    $devicesOutput = Invoke-AdbRaw "devices"
    $deviceConnected = $false
    foreach ($line in ($devicesOutput -split "`r?`n")) {
        if ($line -match "\s+device$") {
            $deviceConnected = $true
            break
        }
    }

    if (-not $deviceConnected) {
        return $false
    }

    # Leer funciones USB actuales del Redmi
    $fn = Invoke-AdbRaw "shell svc usb getFunctions"
    
    if ($fn -notmatch "rndis") {
        Log-Adb "Redmi conectado con funciones '$fn' (Sin Tethering). Forzando RNDIS via ADB..."
        Invoke-AdbRaw "shell svc usb setFunctions rndis" | Out-Null
        Start-Sleep -Seconds 2
        $newFn = Invoke-AdbRaw "shell svc usb getFunctions"
        Log-Adb "Tethering activado via ADB. Nuevas funciones: '$newFn'."
        return $true
    }
    return $true
}

switch ($Action) {
    "Once" {
        Log-Adb "Ejecutando comprobación única de ADB Tether..."
        $res = Ensure-RndisTether
        Log-Adb "Resultado: $(if ($res) { 'OK / Tethering asegurado' } else { 'No hay dispositivo conectado' })"
    }

    "Run" {
        Log-Adb "Iniciando servicio de auto-activación ADB Tether (Intervalo: ${IntervalSeconds}s)..."
        $lastState = $null
        while ($true) {
            $devicesOutput = & $AdbPath devices 2>$null
            $hasDevice = $false
            foreach ($line in ($devicesOutput -split "`r?`n")) {
                if ($line -match "\s+device$") {
                    $hasDevice = $true
                    break
                }
            }

            if ($hasDevice) {
                if ($lastState -ne "connected") {
                    Log-Adb "Redmi detectado en puerto USB. Verificando estado de Tethering..."
                    $lastState = "connected"
                }
                Ensure-RndisTether | Out-Null
            } else {
                if ($lastState -ne "disconnected") {
                    Log-Adb "Redmi no detectado por ADB. A la espera de conexión USB..."
                    $lastState = "disconnected"
                }
            }
            Start-Sleep -Seconds $IntervalSeconds
        }
    }

    "InstallTask" {
        Log-Adb "Instalando tarea programada de Windows '$TaskName'..."
        $scriptPath = $MyInvocation.MyCommand.Path
        $actionCmd = "powershell.exe"
        $argList = "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$scriptPath`" -Action Run"

        $taskAction = New-ScheduledTaskAction -Execute $actionCmd -Argument $argList
        $taskTriggerStartup = New-ScheduledTaskTrigger -AtStartup
        $taskTriggerLogon = New-ScheduledTaskTrigger -AtLogOn
        $taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)

        Register-ScheduledTask -TaskName $TaskName -Action $taskAction -Trigger @($taskTriggerStartup, $taskTriggerLogon) -Settings $taskSettings -RunLevel Highest -Force | Out-Null
        Log-Adb "Tarea programada '$TaskName' instalada con éxito. Se ejecutará siempre que la PC inicie o inicies sesión."
    }

    "UninstallTask" {
        Log-Adb "Desinstalando tarea programada '$TaskName'..."
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
        Log-Adb "Tarea desinstalada."
    }
}
