# PS5 PIPELINE (CAVEMAN ULTRA)

Pipeline PC→PS5: descargar (aria2c) → extraer → servir por LAN → instalar en consola jailbroken.
Migrado desde el scratch de Antigravity (oct-2026) a hogar durable en este repo.
Motor de descargas: **IDM en WAN** (aria2c purgado el 6-oct-2026 tras resolverse el BSOD con RNDIS6; `aria_pilot.js` queda como piloto alternativo, no vigente).

## Comandos

| Intención | Comando |
|---|---|
| Estado unificado (1 comando) | `npm run ps5:status` |
| Snapshot del estado dorado de la consola | `npm run ps5:backup` |
| Auditoría completa PC↔consola | `python pipeline/scripts/audit_full.py [--telegram]` |
| Watchdog jailbreak (loop) | `node pipeline/scripts/kstuff_watchdog.js` |
| Watchdog barrido único | `node pipeline/scripts/kstuff_watchdog.js --once` |
| Watchdog estado | `node pipeline/scripts/kstuff_watchdog.js --status` |
| Autostart PC (manual) | `powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/scripts/ps5_pc_autostart.ps1` |
| Piloto de descargas aria2c (loop) | `npm run ps5:aria-pilot` |
| Salud de enlaces firmados | `npm run ps5:links` |
| Daemon extraer + instalar (loop) | `npm run ps5:daemon` |
| Servidor LAN de PKGs | `npm run ps5:server` |
| Enviar ELF a la consola (elfldr) | `npm run ps5:send-elf -- <ruta.elf>` |
| Estado de la cola y salir | `node pipeline/scripts/aria_pilot.js --once` |
| Plan de instalación y salir | `node pipeline/scripts/daemon.js --status` |

## Arquitectura

| Pieza | Archivo | Función |
|---|---|---|
| Reglas de PKG | `pipeline/lib/pkg_rules.js` | classifyPkg (BASE/UPDATE/DLC/FIX) + cascada por Title ID |
| Cola | `pipeline/lib/queue_state.js` | estados (pending→injected→completed), backoff, reconciliación con disco |
| Config | `pipeline/lib/config.js` | rutas/IPs/puertos SSOT + env `PS5_*` + `data/cache/ps5/config.json` |
| Piloto | `pipeline/scripts/aria_pilot.js` | orquesta cola 1x1 en aria2c (:6800), crash-recovery, extracción y validación |
| Daemon | `pipeline/scripts/daemon.js` | extrae .rar/.zip, clasifica, instala en cascada por 12800 |
| Servidor | `pipeline/scripts/server.js` | `http://PC:9898/pkg/<archivo>` con Range + `/healthz` |
| Sender ELF | `pipeline/scripts/send_elf.js` | payloads a elfldr (TCP 9021) |

Estado en disco (local, gitignored): `data/cache/ps5/` → `queue_state.json`, `installed_pkgs.json`, pidfiles.
Log: `data/logs/ps5_pipeline.log`.

## Puertos y red

| Qué | Puerto | Notas |
|---|---|---|
| elfldr (enviar ELF) | 9021 | `ps5-payload-dev/elfldr`: stream crudo del ELF o `?uri=<file:/...|https://...>` |
| pkg-receiver (instalar) | 12800 | `GET /install?url=<url>&name=<x>` → responder `ok` = aceptado |
| Servidor LAN PC | 9898 | `/pkg/<archivo>` + `/healthz` |
| ShadowMountPlus API | 10101 | solo 127.0.0.1 dentro de la consola (montaje de imágenes/dumps) |
| PC | 192.168.2.1 | Ethernet directa a la consola |
| PS5 | 192.168.2.2 | — |

## Watchdog del jailbreak (kstuff_watchdog.js)

Sintoma histórico: "kstuff funciona y de un momento a otro deja de funcionar". Causa: **SM+ (kstuff_game_auto_toggle=1) pausa kstuff al lanzar un juego y un crash del juego lo dejaba pausado para siempre**.

Fix doble (3-oct-2026):
1. **En consola:** `/data/shadowmount/config.ini` → `kstuff_game_auto_toggle=0` (SM+ ya no toca kstuff; backup en `config.ini.bak-20261003`).
2. **En PC:** `node pipeline/scripts/kstuff_watchdog.js` — cada 60 s chequea 8084/12800/2121/**9021**; si algo degrada, relanza kstuff → pkg-receiver → ftpsrv → elfldr vía `/loadpayload` (rutas reales verificadas por `/list_payloads`) y avisa por Telegram.

Endurecido tras la auditoría del 3-oct (watchdog muerto desde las 11:41 con pidfile huérfano):
- Presupuesto de reparaciones **por sesión de jailbreak** (8; se resetea si la consola reinicia) en vez de por día — ya no se queda sordo a media mañana.
- Sin presupuesto: avisa en el log 1 vez por hora (antes: spam cada minuto).
- `loadpayload` verifica el HTTP 200 de cada payload y lo reporta individualmente.
- Timeout FTP 5 s (2.5 s daba falsos CAÍDO con ftpsrv ocupado en transferencias).
- Inmune a `uncaughtException`/`unhandledRejection`: los registra y sigue vivo.
- Estado en `data/cache/ps5/kstuff_watchdog_state.json`; log en `data/logs/kstuff_watchdog.log`.
- **Keepalive PC:** tarea programada `PS5_PC_Pipeline_Loop` re-ejecuta el autostart idempotente cada 15 min — si el watchdog o el servidor LAN mueren a media sesión, se re-levantan solos.

## Cadena de payloads (autoload, Payload Manager 8084)

`kstuff.elf (v1.11) → 5s → elfldr-ps5.elf (v0.26, 9021) → 5s → pkg-receiver.elf (12800) → 5s → ftpsrv-ps5.elf (2121) → 5s → shadowmountplus.elf`

⚠️ **FW 13.40:** los PKGs instalados (pkg-receiver/debug installer) NO arrancan: kstuff 1.11 solo ejecuta juegos instalados hasta FW 11.60. Para jugar en 13.4x: convertir PKG → imagen `.exfat` y montar con **ShadowMountPlus 1.7** (soporta 13.60, crea `/data/shadowmount`). Pendiente: release de **Kstuff-NG** (EchoStretch) para FPKG instalado en 13.xx. Ver `HISTORIAL-JAILBREAK-PS5.md §15`.

### Autostart del lado PC (3-oct)

Dos tareas programadas de Windows (sin admin):
- **`PS5_PC_Pipeline`** (ONLOGON): ejecuta `pipeline/scripts/ps5_pc_autostart.ps1`, que levanta en oculto el **servidor LAN 9898**, el **watchdog del jailbreak** y el **host del exploit (DNS+HTTPS)** — idempotente (si ya corren, no duplica). Log: `data/logs/ps5_pc_autostart.log`.
- **`PS5_PC_Pipeline_Loop`** (cada 15 min, 3-oct): re-ejecuta el mismo script — autocuración si algo muere a media sesión.

En la consola el único paso manual sigue siendo abrir **WebKit Autoloader** tras cada reinicio (tethered).

### Audit de escena 3-oct (veredicto)

- **¿Subir a 13.60? NO** — la comunidad lo desaconseja ("stay as low as you can"); es el mismo Relapse y FPKG instalado no funciona en ninguno de los dos hasta Kstuff-NG. Única razón para subir: un dump nuevo cuyo update exija FW 13.60 (requisito del juego, no del exploit). **No existe downgrade**.
- **Exploit más estable para Slim disc 13.40:** Relapse vía **WebKit Autoloader 0.5.2** (ya instalada — es la última versión). Requiere interfaz de red activa: **cable LAN permanente**.
- elfldr remoto (9021) añadido al autoload: permite empujar payloads desde la PC con `node pipeline/scripts/send_elf.js <archivo.elf>` — listo para el día 1 de Kstuff-NG.
- **Modo standalone de la PS5 (sin PC):** el exploit vive cacheado en la consola; Relapse solo exige interfaz de red activa (Wi-Fi al router vale). Detalles y reglas: `HISTORIAL-JAILBREAK-PS5.md §13`.

## Blindaje y restauración (3-oct)

Documentación de reconstrucción: **`BLINDADO_RESTAURACION_PS5.md`** (raíz) — estado dorado verificado, Escenario A (reconstrucción desde cero), Escenario B (otra PS5 con FW < 13.60, tabla por rango de FW), artefactos locales de recuperación y riesgos residuales.

Snapshot read-only de la consola: `npm run ps5:backup` → `data/backups/console_state/<fecha>/` (MANIFEST.json con hashes, autoload.txt, config.ini de SM+, los 5 payloads byte-exactos y RESTORE_NOTES.md con los comandos de restauración). Regenerar tras cada cambio en la consola.

## Reglas de oro

1. **Cascada anti-brick:** BASE → UPDATE → DLC. Nunca update/DLC sin base instalada (Regla del daemon).
2. **1x1:** una descarga aria2c a la vez (`max-concurrent-downloads=1` en `tools/aria2c/aria2.conf`).
3. **Extracción verificada:** sin PKG nuevo en biblioteca no se borra el comprimido; fallo → `.failed`.
4. **Instalación condicionada:** daemon solo envía si PS5 responde y está `busy:false` (evita el falso timeout FIFO del pkg-receiver).
5. **Almacenamiento:** extracciones nuevas a `C:\Biblioteca_Juegos_PS` (E:\ se mantiene como espejo histórico).
6. **Pidfiles:** jamás dos daemons iguales (causa histórica de doble descarga/doble instalación).
7. **Higiene de consola:** verificar huérfanos (`audit_orphans_ps5.py`) tras cada
   instalación/borrado y periódicamente; borrar por FTP **solo** residuos
   verificados (nuestros: `/user/download/*`, parches retirados). Stubs de
   sistema (0 bytes) y `/user/temp` no se tocan. Verificar antes y después.

## Consola: exploit y boot

- **WebKit Autoloader 0.5.2** (itsPLK): carga exploit + payloads automática desde el homescreen.
  - Ya jailbroken → instalador ELF por **elfldr** (sin USB): `npm run ps5:send-elf -- <webkit-autoloader-installer_vX.Y.Z.elf>`.
  - Luego: reiniciar consola 1 vez → abrir "WebKit Autoloader" del homescreen.
  - FW 7.00–13.60 usan **Relapse** (requiere interfaz de red activa, no internet). FW 7.00–12.00 permiten elegir **Poops** (100% offline).
- **elfldr del autoloader (7.00–13.60) es localhost-only**: si se necesita envío remoto de ELFs desde el PC, incluir un `elfldr.elf` "normal" en `ps5_autoloader/autoload.txt` (con `!4000` de pausa) o cargarlo por Payload Manager.
- **Payloads:** sin `autoload.txt` el autoloader abre **Payload Manager** (web UI) en cada boot; con `autoload.txt` (USB raíz o `/data/ps5_autoloader`) se encadenan payloads fijos (ej. `etaHEN.elf`, `pkg-receiver.elf`).
- **Regla congelada:** cero updates de firmware (14.00+); DNS anti-update activas.

## Histórico / deuda declarada

- Los scripts viejos viven aún en el scratch de Antigravity (`C:\Users\dev\.gemini\antigravity\brain\...\scratch`), con versiones duplicadas (`master_lan_queue v1/v2/v3`, `idm_akira_loop*`). No se borraron: quedan como referencia hasta que la migración lleve semanas en verde.
- Bug corregido: estado del downloader desincronizado de aria2c → descarga duplicada (reconciliación + GID persistido antes de descargar).
- Bug corregido: clasificación `FullGame`/`UNLOCK` tratados como UPDATE/BASE equivocados.
