# ESTADO_VIVO — PS5 13.40 (CAVEMAN ULTRA)
ts: 2026-10-08T07:50:00-05:00
host: PC Jeiser (192.168.2.1) <-> PS5 (192.168.2.2 direct LAN 1Gbps)
fw: 13.40 Slim Disc · Exploit: WebKit + Relapse
status: ESTABLE · UPTIME >14m · Cero Kernel Panic (Crash 3m ELIMINADO)

## 1. HARDWARE Y RED
* pc_ip: 192.168.2.1 (Intel I211 direct LAN)
* ps5_ip: 192.168.2.2 (ping 0ms)
* ports_open:
  - 2121: ftpsrv (OPEN)
  - 12800: pkg-receiver Loopayeh (OPEN, busy:false)
  - 8084: pldmgr (OPEN)
* storage_ps5:
  - libre: 348.26 GB (+22.75 GB recuperados tras purga BGFT)
  - juegos_instalados: 11 en /user/app (100% preservados, cero formateo)
  - basura: 0 MB (/user/download limpio, /user/bgft/task limpio, /user/temp limpio)

## 2. TIMELINE CRITICO — AUDITORIA DE FALLOS Y SOLUCIONES (8-OCT-2026)
* sintoma_inicial: Apagones / Kernel Panic sistematicos a los 3 min (3m11s, 3m23s).
* intentos_y_descartes:
  - Hipotesis 1: etaHEN corrupto -> Eliminado /data/pldmgr/payloads/etaHEN. Seguia crasheando.
  - Hipotesis 2: kstuff vs kstuff-lite -> SHA256 audit: kstuff.elf == kstuff-lite_v1.11.elf (AB9A6CB4...). No hay kstuff normal en 13.40. Descartado.
  - Hipotesis 3: ShadowMountPlus auto-toggle -> Auditado /data/shadowmount/config.ini: kstuff_game_auto_toggle=0 ya configurado desde 3-oct. Descartado.
  - Hipotesis 4: Hardware / M.2 -> Kingston Gen4 en C: (sistema PC), ADATA Gen3 en E: (bloqueado por POST PS5). Descartado cambio hardware.
  - Hipotesis 5: Reset de fabrica -> EVITADO. Se preservaron 11 juegos y saves.
* CAUSA_RAIZ_REAL: Daemon nativo BGFT (libSceBgft.sprx) intentaba reanudar al boot 20.8 GB de descargas huerfanas (/user/download/CUSA43942 18.5GB + NPXS40140 2.4GB). Al no haber host HTTP, entraba en I/O hang loop -> watchdog timeout PMIC apaga consola a los ~180s.
* SOLUCION_EJECUTADA: Purga FTP quirurgica de /user/download/ y carpetas residuales.
* RESULTADO: Uptime supero 14m continuo sin apagones. Sistema 100% estable.

## 3. PAYLOAD CADENA ACTIVA
* autoloader: WebKit Autoloader v0.6.0 (daemon PC 192.168.2.1:443/:53)
* chain: kstuff-lite v1.11 -> pkg-receiver 12800 -> ftpsrv 2121
* smp_config: /data/shadowmount/config.ini (kstuff_game_auto_toggle=0, kstuff_crash_detection=1)

## 4. INSTALACION PENDIENTE
* target: God of War 2018 (CUSA07408)
  - base: God.of.War.2018-CUSA07408.pkg (36.06 GB)
  - update: GOW_v1.35.PATCH.2018-CUSA07408-.pkg (7.42 GB)
* installer: e:\ps5\tools\diagnostics\gow_lan_installer.py (Range 206, buffers 256KB @ ~100 MB/s LAN)
* gui_alt: E:\ps5\tools\external\PkgSender\PkgSender.exe
