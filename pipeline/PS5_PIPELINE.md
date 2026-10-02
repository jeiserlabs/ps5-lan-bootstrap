# PS5 PIPELINE (CAVEMAN ULTRA)

Pipeline PC→PS5: descargar (IDM) → extraer → servir por LAN → instalar en consola jailbroken.
Migrado desde el scratch de Antigravity (oct-2026) a hogar durable en este repo.

## Comandos

| Intención | Comando |
|---|---|
| Estado unificado (1 comando) | `npm run ps5:status` |
| Sequencer de descargas (loop) | `npm run ps5:sequencer` |
| Daemon extraer + instalar (loop) | `npm run ps5:daemon` |
| Servidor LAN de PKGs | `npm run ps5:server` |
| Enviar ELF a la consola (elfldr) | `npm run ps5:send-elf -- <ruta.elf>` |
| Estado de la cola y salir | `node scripts/ps5/sequencer.js --status` |
| Plan de instalación y salir | `node scripts/ps5/daemon.js --status` |

## Arquitectura

| Pieza | Archivo | Función |
|---|---|---|
| Reglas de PKG | `lib/ps5/pkg_rules.js` | classifyPkg (BASE/UPDATE/DLC/FIX) + cascada por Title ID |
| Cola | `lib/ps5/queue_state.js` | estados (pending→injected→completed), backoff, reconciliación con disco |
| Config | `lib/ps5/config.js` | rutas/IPs/puertos SSOT + env `PS5_*` + `data/cache/ps5/config.json` |
| Sequencer | `scripts/ps5/sequencer.js` | resuelve enlace AkiraBox (Playwright CDP/Brave) → IDM, 1x1 |
| Daemon | `scripts/ps5/daemon.js` | extrae .rar/.zip, clasifica, instala en cascada por 12800 |
| Servidor | `scripts/ps5/server.js` | `http://PC:9898/pkg/<archivo>` con Range + `/healthz` |
| Sender ELF | `scripts/ps5/send_elf.js` | payloads a elfldr (TCP 9021) |

Estado en disco (local, gitignored): `data/cache/ps5/` → `queue_state.json`, `installed_pkgs.json`, pidfiles.
Log: `data/logs/ps5_pipeline.log`.

## Puertos y red

| Qué | Puerto | Notas |
|---|---|---|
| elfldr (enviar ELF) | 9021 | `ps5-payload-dev/elfldr`: stream crudo del ELF o `?uri=<file:/...|https://...>` |
| pkg-receiver (instalar) | 12800 | `GET /install?url=<url>&name=<x>` → responder `ok` = aceptado |
| Servidor LAN PC | 9898 | `/pkg/<archivo>` + `/healthz` |
| PC | 192.168.2.1 | Ethernet directa a la consola |
| PS5 | 192.168.2.2 | — |

## Reglas de oro

1. **Cascada anti-brick:** BASE → UPDATE → DLC. Nunca update/DLC sin base instalada (Regla del daemon).
2. **1x1:** una descarga IDM a la vez (el sequencer no interfiere si IDM está ocupado con algo ajeno).
3. **Extracción verificada:** sin PKG nuevo en biblioteca no se borra el comprimido; fallo → `.failed`.
4. **Instalación condicionada:** daemon solo envía si PS5 responde y está `busy:false` (evita el falso timeout FIFO del pkg-receiver).
5. **Almacenamiento:** extracciones nuevas a `C:\Biblioteca_Juegos_PS` (E:\ se mantiene como espejo histórico).
6. **Pidfiles:** jamás dos daemons iguales (causa histórica de doble descarga/doble instalación).

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
- Bug corregido: estado del sequencer desincronizado de IDM → descarga duplicada (reconciliación + `activeInjection` persistida antes de inyectar).
- Bug corregido: clasificación `FullGame`/`UNLOCK` tratados como UPDATE/BASE equivocados.
