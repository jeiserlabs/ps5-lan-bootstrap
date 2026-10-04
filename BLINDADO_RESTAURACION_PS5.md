# BLINDADO — Restauración y Replicación del Jailbreak PS5

> **Propósito:** si este setup se daña (Escenario A) o hay que montarlo en **otra PS5 con FW < 13.60** (Escenario B), este documento + los snapshots locales contienen TODO para reconstruir sin volver a investigar.
> **Estado dorado verificado en vivo:** 3-oct-2026 · auditoría completa: `AUDIT_Y_PREMORTEM_PS5_2026-10-03.md`.
> **REGLA CERO:** NUNCA actualizar firmware. No existe downgrade. 14.10+ (salió 1-oct-2026) parchea Relapse. Bloqueo DNS siempre activo.

## 1. Estado dorado (lo que funciona HOY — referencia canónica)

| Pieza | Valor exacto | Verificación |
|---|---|---|
| Consola | PS5 Slim disc · FW 13.40 (v26.04-13.40.00.02) | Ajustes > Sistema |
| Exploit | **Relapse** (WebKit, KEX 7.00–13.60) vía **WebKit Autoloader v0.5.2** (WKAL00001) | `:8084/version` → `0.5.2` |
| Cadena autoload | `kstuff.elf,elfldr-ps5.elf,pkg-receiver.elf,ftpsrv-ps5.elf,shadowmountplus.elf` (delay 5s) | `:8084/get_config` |
| Red | PC `192.168.2.1` (I211, sin gateway) ↔ PS5 `192.168.2.2` (MAC 0C:70:43:08:21:0C) cable directo | ping 0 ms |
| DNS consola | Manual `192.168.2.1` (host PC: manuals.playstation.net → PC; TODO lo demás NXDOMAIN) | `nslookup` / log host |
| Puertos PS5 | 8084 PMGR · 12800 pkg-receiver · 2121 ftpsrv · 9021 elfldr · (10101 SM+ localhost-only) | TCP probes |
| PC PC | Servidor LAN PKGs 9898 · host DNS+HTTPS 53/443 · watchdog 60s · keepalive 15 min | `/healthz`, schtasks |

### Payloads dorados (hashes SHA256, verificados consola ↔ repo el 3-oct)

| Payload | Versión | SHA256 (prefijo) | FW soportado |
|---|---|---|---|
| kstuff.elf | 1.11 (EchoStretch) | `ab9a6cb4` | jailbreak 1.00–13.60 · FPKG solo ≤11.60 |
| elfldr-ps5.elf | 0.26 (ps5-payload-dev) | `ed6d587a` | envío de payloads por TCP 9021 |
| pkg-receiver.elf | (baseline) | `6946d52c` | instalación PKG por 12800 |
| ftpsrv-ps5.elf | 0.21.1 (ps5-payload-dev) | `7d4b31c8` | FTP 2121 (anonymous) |
| shadowmountplus.elf | 1.7b3 (drakmor) | `2a7427e2` | montaje .exfat, FW hasta 13.60 |

**Config crítica SM+:** `/data/shadowmount/config.ini` → `kstuff_game_auto_toggle=0` (si=1, un crash de juego dejaba kstuff pausado para siempre). Backup en consola: `config.ini.bak-20261003`.

**Snapshot byte-exacta del estado dorado:** `data/backups/console_state/<timestamp>/` (generada con `npm run ps5:backup`): MANIFEST.json + autoload.txt + shadowmount_config.ini + los 5 payloads tal cual están en la consola + RESTORE_NOTES.md con los comandos exactos de restauración.

## 2. Artefactos locales de recuperación (no re-descargar nada de internet)

| Artefacto | Ubicación | Hash verificado |
|---|---|---|
| Host del exploit (PC) | `ps5-host/webkit-autoloader-host_v0.5.2.py` (y .exe) | `6421f167…` / `3b0540d4…` |
| **Instalador del Autoloader (ELF)** | `ps5-host/webkit-autoloader-installer_v0.5.2.elf` | `f990e48e…` (bajado 3-oct de la release oficial) |
| Cert host (CN=manuals.playstation.net, 10 años) | `ps5-host/cert.pem` | — |
| Payloads | `payloads/*.elf` (4) + copia byte-exacta en el snapshot | tabla §1 |
| Installer ELF alternativo en consola | `/data/ps5_autoloader/pldmgr.elf` (inerte, sin autoload.txt ahí) | — |

Si algún día hacen falta re-descargar (URLs oficiales del 3-oct-2026):
- `https://github.com/itsPLK/ps5-webkit-autoloader/releases/download/v0.5.2/webkit-autoloader-host_v0.5.2.py`
- `https://github.com/itsPLK/ps5-webkit-autoloader/releases/download/v0.5.2/webkit-autoloader-installer_v0.5.2.elf`
- `https://github.com/EchoStretch/kstuff-lite/releases/download/v1.11/kstuff.elf`
- `https://github.com/ps5-payload-dev/ftpsrv/releases` (v0.21.1) · elfldr v0.26 · SM+ 1.7b3 (drakmor)

⚠️ `.env` (Telegram) NO está en git — copia fuera del repo obligatoria (ver §5).

## 3. ESCENARIO A — Reconstrucción desde cero

### A1. Lado PC (FW-independiente, ~20 min)

1. **Requisitos:** Node 20+ (`C:\Program Files\nodejs\node.exe`), Python 3.14 (`C:\Python314\python.exe`), este repo en `E:\ps5`.
2. **Firewall** (2 reglas, solo subred del cable; requiere elevación una vez):
   ```
   netsh advfirewall firewall add rule name="PS5 Autoloader DNS" dir=in action=allow protocol=UDP localport=53 remoteip=192.168.2.0/24
   netsh advfirewall firewall add rule name="PS5 Autoloader HTTPS" dir=in action=allow protocol=TCP localport=443 remoteip=192.168.2.0/24
   ```
   Deshacer: `netsh advfirewall firewall delete rule name="<nombre>"`.
3. **Tareas programadas** (sin admin):
   ```
   schtasks /create /tn "PS5_PC_Pipeline" /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\ps5\pipeline\scripts\ps5_pc_autostart.ps1" /sc onlogon /f
   schtasks /create /tn "PS5_PC_Pipeline_Loop" /tr "powershell.exe -NoProfile -ExecutionPolicy Bypass -File E:\ps5\pipeline\scripts\ps5_pc_autostart.ps1" /sc minute /mo 15 /f
   ```
   (El autostart levanta server 9898 + watchdog + host DNS+HTTPS, idempotente.)
4. **Telegram (opcional):** restaurar `.env` desde la copia externa (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`). Sin él, todo funciona; solo no hay avisos.
5. **Adaptador de red:** IP fija `192.168.2.1`, máscara `255.255.255.0`, SIN gateway, SIN DNS; desactivar ahorro de energía del NIC I211.
6. **Verificar PC:** `curl http://192.168.2.1:9898/healthz` → `ok` · TCP 443 local abierto · `node pipeline/scripts/kstuff_watchdog.js --status` → pid vivo.

### A2. Lado consola (FW 7.00–13.60)

1. **Preparar consola:** confirmar FW · Ajustes > Sistema > actualizaciones automáticas OFF · borrar cookies/datos del navegador SOLO si el navegador está roto (¡borra la página cacheada!) · red con **DNS manual `192.168.2.1`** (cable o Wi-Fi al router; internet NO necesario).
2. **Instalar el Autoloader (solo primera vez):** PC con host vivo (tarea ONLOGON o `powershell -NoProfile -ExecutionPolicy Bypass -File pipeline\scripts\ps5_pc_autostart.ps1`) → en consola: Ajustes > Guía y avisos > **Guía del usuario** → carga el instalador → la consola reinicia → aparece **WebKit Autoloader** en el inicio.
   - Alternativa con jailbreak ya activo (ej. BD-JB u otro exploit): `node pipeline/scripts/send_elf.js ps5-host/webkit-autoloader-installer_v0.5.2.elf` → reboot → abrir la app.
3. **Primer boot de la app:** abre el Autoloader → explota (Relapse) y arranca **Payload Manager** → en PC subir los 5 payloads y configurar la cadena:
   ```
   for f in kstuff.elf elfldr-ps5.elf pkg-receiver.elf ftpsrv-ps5.elf shadowmountplus.elf; do
     curl -X POST --data-binary @"payloads/$f" "http://192.168.2.2:8084/manage:upload?filename=$f"
   done
   curl -X POST -H "Content-Type: application/json" -d '{"AUTOLOAD_ENABLED":true,"AUTOLOAD_LIST":"kstuff.elf,elfldr-ps5.elf,pkg-receiver.elf,ftpsrv-ps5.elf,shadowmountplus.elf","AUTOLOAD_DELAY":5,"SCAN_USB_PAYLOADS":false}' http://192.168.2.2:8084/set_config
   ```
   (desde la raíz del repo; funciona en Git Bash y en PowerShell con el for adaptado)
4. **Fix SM+ (crítico):** tras el primer boot con la cadena corriendo:
   ```
   curl -T <snapshot>/shadowmount_config.ini "ftp://192.168.2.2:2121/data/shadowmount/config.ini"
   ```
   (crear `/data/shadowmount/` si no existe: abrir SM+ una vez desde el Payload Manager).
5. **Reboot** → abrir WebKit Autoloader → esperar las 5 notificaciones → cadena 5/5.

### A3. Verificación final (checklist exacto)

```bash
node pipeline/scripts/kstuff_watchdog.js --status                 # pid vivo
node pipeline/scripts/console_state_backup.js                    # snapshot nueva: 8 archivos, 5 payloads "hash ok"
curl http://192.168.2.2:8084/version                              # 0.5.2
curl http://192.168.2.2:8084/autoload_status                      # total:5 done:5 DONE
curl http://192.168.2.2:12800/api/status                          # {"busy":...} vivo
node -e "..." # TCP 2121/9021 abiertos (ver manual §6)
curl -s ftp://192.168.2.2:2121/data/shadowmount/config.ini | grep toggle   # =0
git status --short                                                # limpio
npm test                                                          # 33/33
```

## 4. ESCENARIO B — Otra PS5 con FW < 13.60

**Qué NO cambia:** todo el lado PC (§3.A1), los payloads dorados (kstuff 1.11 cubre 1.00–13.60; ftpsrv/elfldr/pkg-receiver/SM+ son FW-agnósticos), la red, y las reglas de oro.

**Qué SÍ cambia:** el exploit de entrada y el camino de instalación según el FW:

| FW de la consola | Entrada userland | Kernel | Cómo instalar | Notas |
|---|---|---|---|---|
| **7.00–13.60** | **WebKit Autoloader 0.5.2** (idéntico al actual) | **Relapse** | Idéntico a §3.A2 paso 2 | La vía recomendada; requiere interfaz de red activa (no internet) |
| 7.00–12.00 | WebKit Autoloader con exploit **Poops** a elegir | Poops (slopkit) | Mismo instalador; en el menú del exploit elegir Poops | **100% offline** (ni interfaz de red necesita) — ideal si la consola vivirá sin cable/Wi-Fi |
| 4.03–6.02 | Página WebKit **PSFree/UMTX2** auto-alojada (zecoxao.github.io/luasauce o kmeps4/PSFree) | UMTX2 | Host DNS+HTTPS de la PC sirviendo la página en manuals.playstation.net → Guía del usuario | El Autoloader NO cubre estos FW; no hay app instalada: repetir la visita a la Guía en cada reboot, o BD-JB |
| 1.00–3.xx | WebKit PSFree (raro, solo colección) | UMTX2 | Igual que 4.03–6.02 | Casi nadie está aquí; no actualizar para "llegar" a 7.00 sin investigar antes |
| 9.00–12.70 | (alternativa) P2JB | P2JB | Explota por WEBKIT también | Tarda >1h en explotar; solo si Relapse fallara |
| 4.03–13.40 | (alternativa) Y2JB (app YouTube) | Relapse en 13.xx / Lapse ≤10.01 | Evaluado y DESCARTADO el 3-oct (ver AUDIT §7): más dependiente de PC y riesgo de borrar biblioteca | Solo como última puerta trasera |

**Pasos para una PS5 nueva (FW 7.00–13.60):**
1. Antes de tocar internet: verificar FW en Ajustes > Sistema. Si está POR DEBAJO de 13.60 y sin jailbreak: **NO actualizar jamás** — lower es mejor (más exploits, más estabilidad; Kstuff-NG cuando salga cubrirá igual).
2. Desactivar actualizaciones automáticas · DNS manual `192.168.2.1` · cable o Wi-Fi al router.
3. Seguir §3.A2 tal cual (el host de la PC y el instalador ELF son los mismos).
4. Subir los mismos 5 payloads dorados + cadena + fix SM+ (§3.A2 pasos 3–4).
5. Si el FW es ≤11.60: además puede ejecutar FPKG instalado por 12800 (kstuff 1.11 lo soporta). En 12.xx–13.60: jugar vía imágenes .exfat + SM+ hasta Kstuff-NG.
6. Snapshot inicial de la nueva consola: `npm run ps5:backup` (queda como baseline de hashes distinta por consola).

**Errores típicos en PS5 nueva:**
- FW 12.xx con Poops y sin interfaz de red: el Autoloader pide red SOLO para Relapse; con Poops no hace falta — elegir el exploit correcto en el menú del autoloader.
- "No carga la página" = DNS mal puesto en la consola o host PC muerto (TCP 443 en 192.168.2.1).
- "Explota pero no hay payloads" = el PMGR arrancó sin cadena: revisar `:8084/get_config` y re-aplicar set_config.
- Juego FPKG instalado no arranca en 12.xx+: NO es fallo del jailbreak — es el límite de kstuff (FPKG ≤11.60). Usar .exfat + SM+.

## 5. Snapshots y secretos (rutina de blindaje)

- **Regenerar snapshot:** `npm run ps5:backup` (read-only contra la consola). Hacerlo: tras cambiar la cadena, tras subir un payload nuevo, y una vez al mes. Cada snapshot va a `data/backups/console_state/<fecha>/` y vive en DISCO (gitignored por diseño — los .elf no van a GitHub, Regla 15).
- **Copiar fuera del PC (una vez y tras cada cambio grande):** el snapshot más reciente + `ps5-host/` + `.env` → USB o Drive. Con eso, una PC nueva reconstruye todo sin internet.
- **Qué NO está en git:** `.env` (tokens Telegram), payloads .elf, snapshots, cert.pem. Todo local en `E:\ps5` — por eso la copia externa es obligatoria.

## 6. Lo que este blindaje NO cubre (riesgos residuales)

1. **Borrar datos del navegador** de la PS5 → página cacheada del exploit muerta. Recuperación §3.A2 paso 2 (5 min con PC).
2. **Cable directo a PC apagada** → sin link → Relapse no explota. Síntoma exacto en pantalla: `[relapse] [-] kaslr: no interface has an address`. Reconectar cable (PC encendida) o Wi-Fi con DNS muerto `192.168.2.1` y pulsar **△ Volver a cargar**; el reboot no es necesario. Un switch barato entre PC y PS5 elimina este caso.
3. **Actualizar firmware** → irreversible. El DNS bloquea las descargas de updates; no aceptar el aviso de update nunca.
4. **Mismo PC con otra IP** → cambiar `PS5_PC_IP`/config y revisar reglas firewall + DNS de la consola.
5. Detalle completo de fallos y runbook de síntomas: `AUDIT_Y_PREMORTEM_PS5_2026-10-03.md` §4–5.

## 7. Comandos de operación rápida

| Intención | Comando |
|---|---|
| Snapshot del estado dorado | `npm run ps5:backup` |
| Estado unificado | `npm run ps5:status` |
| Salud del jailbreak (1 barrido) | `npm run ps5:watchdog:once` |
| Enviar un ELF nuevo (ej. Kstuff-NG día 1) | `npm run ps5:send-elf -- <ruta.elf>` |
| Auditoría PC↔consola completa | `npm run ps5:audit` |
| Restaurar cadena autoload | ver `RESTORE_NOTES.md` del snapshot más reciente |

