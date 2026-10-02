<#
.SYNOPSIS
    safe_tether_watchdog.ps1 - Blindaje y reconexión autónoma de Tethering USB con Auto-Rollback.
.DESCRIPTION
    Maneja la conexión USB Tethering (Xiaomi Redmi Note 8 Pro) via ADB y provee un Dead Man's Switch.
    Si se intenta actualizar el driver o cae la red, revierte al driver estable y reactiva ADB en <45s.
.EXAMPLE
    .\safe_tether_watchdog.ps1 -Mode Check
    .\safe_tether_watchdog.ps1 -Mode KeepAlive
    .\safe_tether_watchdog.ps1 -Mode Upgrade
#>
[CmdletBinding()]
param(
    [ValidateSet("Check", "KeepAlive", "ReactivateTether", "Upgrade")]
    [string]$Mode = "Check"
)

$ErrorActionPreference = "Continue"
$AdbPath = "C:\Users\dev\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$LogPath = "E:\ps5\data\logs\tether_watchdog.log"

function Log-Message([string]$msg) {
    $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[$ts] $msg"
    Write-Host $line
    Add-Content -Path $LogPath -Value $line -ErrorAction SilentlyContinue
}

function Test-InternetConnection {
    $ping = Test-Connection -ComputerName 8.8.8.8 -Count 2 -Quiet -ErrorAction SilentlyContinue
    if (-not $ping) {
        $ping = Test-Connection -ComputerName 1.1.1.1 -Count 2 -Quiet -ErrorAction SilentlyContinue
    }
    return $ping
}

function Invoke-PhoneTetherAdb {
    if (-not (Test-Path $AdbPath)) {
        Log-Message "ERROR: adb.exe no encontrado en $AdbPath"
        return $false
    }
    try {
        & $AdbPath wait-for-device | Out-Null
        & $AdbPath shell svc usb setFunctions rndis | Out-Null
        $raw = (& $AdbPath shell svc usb getFunctions | Out-String)
        $fn = $raw.Trim()
        Log-Message "ADB Phone Tether: funciones activas = $fn"
        return ($fn -match "rndis")
    } catch {
        Log-Message "ERROR al comunicar con ADB: $($_.Exception.Message)"
        return $false
    }
}

function Invoke-SafeRollback {
    Log-Message "ALERTA: Disparando Auto-Rollback al driver original (wceisvista.inf)..."
    try {
        # Re-enlazar wceisvista.inf original
        pnputil /add-driver "C:\Windows\INF\wceisvista.inf" /install | Out-Null
        # Forzar reactivación de tethering por ADB
        Invoke-PhoneTetherAdb | Out-Null
        # Reiniciar dispositivo PnP si existe
        $dev = Get-PnpDevice -Class "Net" | Where-Object { $_.FriendlyName -match "Remote NDIS" } | Select-Object -First 1
        if ($dev) {
            pnputil /restart-device $dev.InstanceId | Out-Null
        }
        Start-Sleep -Seconds 5
        if (Test-InternetConnection) {
            Log-Message "ROLLBACK EXITOSO: Conexión a Internet reestablecida al 100%."
            return $true
        } else {
            Log-Message "ROLLBACK PARCIAL: Esperando renegociación DHCP del teléfono..."
            return $false
        }
    } catch {
        Log-Message "ERROR en Rollback: $($_.Exception.Message)"
        return $false
    }
}

# --- ENTRADA PRINCIPAL ---

if (-not (Test-Path (Split-Path $LogPath))) {
    New-Item -ItemType Directory -Path (Split-Path $LogPath) -Force | Out-Null
}

switch ($Mode) {
    "Check" {
        Log-Message "=== DIAGNOSTICO DE RED Y TETHERING ==="
        $online = Test-InternetConnection
        Log-Message "Estado Internet: $(if ($online) { 'ONLINE (OK)' } else { 'OFFLINE' })"
        
        $dev = Get-PnpDevice -Class "Net" | Where-Object { $_.FriendlyName -match "Remote NDIS" -and $_.Status -eq "OK" } | Select-Object -First 1
        if ($dev) {
            Log-Message "Dispositivo PnP: $($dev.FriendlyName) [$($dev.Status)]"
            Log-Message "InstanceId: $($dev.InstanceId)"
        } else {
            Log-Message "Dispositivo PnP: No se encontró adaptador Remote NDIS."
        }
        
        Invoke-PhoneTetherAdb | Out-Null
    }

    "ReactivateTether" {
        Log-Message "Forzando reactivación de USB Tethering via ADB..."
        $ok = Invoke-PhoneTetherAdb
        Start-Sleep -Seconds 5
        $online = Test-InternetConnection
        Log-Message "Resultado: Tethering=$ok | Internet=$online"
    }

    "KeepAlive" {
        Log-Message "Iniciando Watchdog KeepAlive en bucle continuo..."
        while ($true) {
            $online = Test-InternetConnection
            if (-not $online) {
                Log-Message "Conexión perdida. Intentando reanimar via ADB..."
                Invoke-PhoneTetherAdb | Out-Null
                Start-Sleep -Seconds 10
                if (-not (Test-InternetConnection)) {
                    Log-Message "Reanimación fallida. Ejecutando Rollback de driver..."
                    Invoke-SafeRollback | Out-Null
                }
            }
            Start-Sleep -Seconds 30
        }
    }

    "Upgrade" {
        Log-Message "=== INICIANDO UPGRADE CONTROLADO CON DEAD MAN'S SWITCH ==="
        if (-not (Test-InternetConnection)) {
            Log-Message "ABORTADO: No hay Internet previo. No es seguro iniciar upgrade."
            exit 1
        }
        
        # 1. Armar Dead Man's Switch en un proceso desacoplado (120 segundos de gracia)
        $deadManScript = @"
Start-Sleep -Seconds 120
`$ping = Test-Connection -ComputerName 8.8.8.8 -Count 2 -Quiet -ErrorAction SilentlyContinue
if (-not `$ping) {
    Add-Content -Path '$LogPath' -Value ('[' + (Get-Date).ToString('yyyy-MM-dd HH:mm:ss') + '] DEAD MAN SWITCH DISPARADO: Sin internet tras 120s. Revirtiendo a wceisvista.inf...')
    & '$AdbPath' wait-for-device
    & '$AdbPath' shell svc usb setFunctions rndis
    pnputil /add-driver 'C:\Windows\INF\wceisvista.inf' /install
    `$dev = Get-PnpDevice -Class 'Net' | Where-Object { `$_.FriendlyName -match 'Remote NDIS' } | Select-Object -First 1
    if (`$dev) { pnputil /restart-device `$dev.InstanceId }
}
"@
        $encodedCmd = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($deadManScript))
        Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile", "-EncodedCommand", $encodedCmd -WindowStyle Hidden
        Log-Message "Dead Man's Switch armado (Ventana de 120s con Auto-Rollback garantizado si no hay conexión)."

        # 2. Intentar cambio de driver
        try {
            Log-Message "Iniciando instalación de netrndis.inf (NDIS 6.x)..."
            pnputil /add-driver "C:\Windows\INF\netrndis.inf" /install | Out-Null
            Invoke-PhoneTetherAdb | Out-Null
        } catch {
            Log-Message "Aviso durante instalación: $($_.Exception.Message)"
        }

        # 3. Ventana interactiva de 120s esperando que el usuario/ADB active tethering
        Log-Message "Esperando sincronización (Activa el Tethering USB en el celular si se apagó)..."
        $recovered = $false
        for ($i = 1; $i -le 24; $i++) {
            Start-Sleep -Seconds 5
            $timeLeft = 120 - ($i * 5)
            
            # Reintento periódico de ADB para asistir al usuario
            if ($i % 3 -eq 0) {
                Invoke-PhoneTetherAdb | Out-Null
            }

            if (Test-InternetConnection) {
                Log-Message "¡CONEXIÓN DETECTADA Y CONFIRMADA! (Restaban ${timeLeft}s)."
                $recovered = $true
                break
            } else {
                Log-Message "Sin conexión aún... Restan ${timeLeft}s en la ventana de seguridad."
            }
        }

        if ($recovered) {
            Log-Message "EXITO TOTAL: NDIS 6.x está activo y la PC está ONLINE con el Redmi."
        } else {
            Log-Message "Tiempo agotado (120s). Disparando Rollback inmediato..."
            Invoke-SafeRollback | Out-Null
        }
    }
}
