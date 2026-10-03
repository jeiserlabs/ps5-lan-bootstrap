# AUDITORÍA CRUEL + PREMORTEM — Estabilidad del Jailbreak PS5 (FW 13.40)

**Fecha:** 3-oct-2026 (tarde) · **Auditor:** Buffy (Codebuff)
**Contexto:** PS5 Slim disc 13.40 conectada por LAN y descargando juegos durante la auditoría. Verificaciones read-only contra la consola; los fixes tocaron solo código del PC.
**Criterio de aceptación:** el jailbreak no degrada a media sesión; si degrada, se detecta, repara y avisa solo; todo lo de la consola es 100% local (autoloader cacheado).

---

## 1. Verificación en vivo (lo que está BIEN)

| Verificación | Método | Resultado |
|---|---|---|
| Consola accesible | ping 192.168.2.2 | ✅ 0 ms, 0% pérdida |
| Payload Manager | `GET :8084/version` | ✅ 0.5.2 (última release oficial) |
| Cadena autoload | `:8084/autoload_status` | ✅ `total:5, done:5, DONE` — corrió completa este boot |
| Config autoload | `:8084/get_config` | ✅ idéntica a la canónica (5 payloads, delay 5s) |
| Fix de SM+ | FTP `/data/shadowmount/config.ini` | ✅ `kstuff_game_auto_toggle=0` persistente |
| Sin autoload competidor | FTP `/data/ps5_autoloader/` | ✅ no existe autoload.txt (solo manda el Payload Manager) |
| Integridad de payloads | descarga FTP + SHA256 × 5 | ✅ idénticos a los locales: kstuff `ab9a6cb4…` (v1.11), ftpsrv `7d4b31c8…` (v0.21.1), SM+ `2a7427e2…` (1.7b3), elfldr `ed6d587a…` (v0.26), pkg-receiver `6946d52c…` (baseline nuevo) |
| Puertos de servicio | TCP | ✅ 8084, 12800, 2121, 9021 abiertos |
| pkg-receiver libre | `:12800/api/status` | ✅ `busy:false` durante la auditoría |
| Servidor LAN PC | `:9898/healthz` | ✅ sirviendo C:\ y E:\ Biblioteca_Juegos_PS |
| Host exploit PC | TCP 443 local | ✅ vivo (DNS+HTTPS, bloqueo de updates) |
| Firewall | `netsh advfirewall` | ✅ reglas UDP 53 y TCP 443 activas |
| Tarea ONLOGON | `schtasks /query` | ✅ `PS5_PC_Pipeline` = Listo |
| Tests del repo | `npm test` | ✅ 33/33 (5 suites) |

## 2. Críticos encontrados (y corregidos hoy)

### C1. El watchdog del jailbreak estaba MUERTO desde las 11:41 (16:41Z)
El pidfile apuntaba al PID 8372 (inexistente). Los únicos procesos vivos eran `server.js` e `idm_watcher.js`. **El PS5 estuvo ~5 h sin vigilancia** mientras Jeiser jugaba/descargaba. Causas raíz:
- El proceso corría **código viejo** (su log dice `pkg-receiver responde de nuevo`, texto que no existe en el código actual) → el archivo se corrigió después de lanzarlo; el daemon nunca tomó la versión nueva.
- Moría por **excepciones no capturadas** sin log fatal.
- El pidfile quedó huérfano y el autostart solo corre al logon → nadie lo re-levara.

**Fixes:** neutralización de `uncaughtException`/`unhandledRejection` (loguea y sigue), watchdog relanzado con el código nuevo (PID 16332, verificado vivo con primer barrido limpio), y **keepalive**: tarea `PS5_PC_Pipeline_Loop` cada 15 min re-ejecuta el autostart idempotente → si el watchdog, el server 9898 o el host del exploit mueren a media sesión, se re-levantan solos.

### C2. Las reparaciones eran un no-op silencioso
- `loadPayload` probaba `loadpayload:<nombre>` y como fallback la ruta `…/payloads/<nombre>/<nombre>` — **esa ruta no existe en la consola**. Los dirs reales (verificados con `/list_payloads` y FTP): `kstuff/kstuff.elf`, `pkg-receiver/pkg-receiver.elf`, `ftpsrv/ftpsrv-ps5.elf`, `elfldr/elfldr-ps5.elf`, `shadowmountplus/shadowmountplus.elf`.
- Además exigía `ok` en el body aunque aceptaba solo HTTP 200, e ignoraba el resultado de cada lanzamiento.
**Fix:** mapa de rutas reales, ruta completa primero (forma verificada que devuelve 200), resultado por payload logueado; se relanza además `elfldr-ps5.elf` (antes solo kstuff/pkg-receiver/ftpsrv) y se chequea 9021 en la salud.

### C3. Presupuesto de 8 reparaciones/día = watchdog sordo a media mañana
Hoy quemó los 8 intentos antes del mediodía (ftpsrv degradado 11:05–11:54) y pasó a loguear spam cada minuto sin poder arreglar nada.
**Fix:** presupuesto **por sesión de jailbreak** (se resetea cuando la consola pasa de offline→online, es decir, al re-abrir el Autoloader tras un reinicio) + cooldown 10 min + aviso de sin-presupuesto 1 vez/hora.

### C4. Falso "ftpsrv CAÍDO" con timeout de 2.5 s
`ftpsrv` sirve transferencias grandes (FileZilla); ocupado, el backlog puede superar 2.5 s → falso CAÍDO → reparación innecesaria que relanza payloads (riesgo de matar sesiones FTP activas). Hoy hubo una hora entera de falsos positivos mientras ftpsrv en realidad seguía vivo.
**Fix:** timeout FTP 5 s. (La degradación de 11:05–11:54 podría haber sido 100% falsa: ftpsrv respondió a mis probes al instante.)

### C5. `package.json` no existía
Todos los `npm run ps5:*` de `PS5_PIPELINE.md` estaban rotos (además el doc referenciaba rutas `scripts/ps5/…` viejas). **Fix:** creado con los scripts correctos + `test`. Doc corregido.

### Menores (sin acción, documentados)
- `pkg-receiver` no está en `payloads/` local (vino de USB). Consola tiene el único binario; hash registrado como baseline `6946d52c…`.
- `AUTO_BROWSER_OPEN:true` y `KILL_DISC_PLAYER_ON_STARTUP:true` en el Payload Manager: intencionales, no tocar.
- Kstuff-NG: solo rumor de beta con FPKG en 13.60 (r/PS5_Jailbreak, sin confirmar). GBAtemp (hilo actualizado hoy) sigue con "KStuff-NG SOON"; EchoStretch: "no ETA". **No perseguir betas de terceros en 13.40.**

## 3. Escena PS5 hoy (scraping en vivo, 3-oct)

| Fuente | Dato |
|---|---|
| GitHub API itsPLK | Autoloader **v0.5.2** (30-sep) = última release; `webkit-autoloader-host_v0.5.2.exe` sha256 `3b0540d4…` coincide con el del repo |
| GitHub API EchoStretch | kstuff-lite **v1.11** (20-sep) = última release; `kstuff.elf` sha256 `ab9a6cb4…` = el instalado; repo sin push nuevo |
| GBAtemp PS5 Exploit Guide (p.1167, hoy) | KEX máximo released = **Relapse 7.00–13.60**; FPKG = 3.00–11.60 (Kstuff Lite) / 12.XX–13.60 **"KStuff-NG SOON"**; **OFW 14.10 (1-oct)**; "PSN access: NEVER"; "stay as low as possible" |
| r/PS5_Jailbreak (3 días) | "FPKG reportedly working on 13.60 via kstuff-ng" — **reporte no verificado, sin release pública** |
| EchoStretch (X) | "Kstuff Next Gen. No ETA yet" |

**Conclusión:** en 13.40 ya se tiene exactamente el mejor stack disponible hoy. Relapse+Autoloader 0.5.2+kstuff 1.11 es la combinación recomendada por la escena; Kstuff-NG no ha publicado nada. Cuando salga (vigilar release de EchoStretch), se instala por `npm run ps5:send-elf` o `/manage:upload` sin tocar nada más.

## 4. Premortem (cómo puede morir la estabilidad, con detección/fix)

| # | Fallo | Probabilidad | Impacto | Detección | Prevención/Recuperación |
|---|---|---|---|---|---|
| P1 | **Se borran datos del navegador** → página del exploit no cacheada | Media (limpieza manual) | Autoloader no carga | App WKAL00001 abre y no carga nada | Reinstalar con PC: host DNS+HTTPS vivo (tarea ONLOGON) → Guía del usuario. **Nunca borrar cookies/datos del navegador** |
| P2 | **PC apagada + cable directo** → sin link → Relapse no explota | Alta si se usa con PC apagada | Sin jailbreak en ese boot | 8084 no responde; watchdog avisa por Telegram | Usar Wi-Fi de casa con DNS muerto `192.168.2.1` (probado 3-oct) o dejar la PC encendida. Ideal: un **switch barato** entre PC y PS5 mantiene el link siempre |
| P3 | **Juego se cuelga y arrastra payloads** (caso MLB CUSA43942) | Media | kstuff/pkg-receiver muertos a media sesión | Watchdog 60 s + Telegram; reparación auto | Ya activa: `kstuff_game_auto_toggle=0` + repairCycle. Si el juego crashea 2 veces seguidas, no insistir: reboot |
| P4 | **Watchdog PC muere silencioso** | Era real (ocurrió hoy) | Sin vigilancia hasta próximo logon | Tarea `PS5_PC_Pipeline_Loop` cada 15 min re-levanta | Ya corregido (excepciones neutralizadas + keepalive) |
| P5 | **Autoloader panic al abrir** (Relapse colgado) | Media | Cadena no corre | 8084 cerrado > 2 min → Telegram "abrir Autoloader" | Apagado 10 s, reintentar; si falla 2×, esperar 5 min antes del 3er intento |
| P6 | **Update de firmware accidental** | Baja (DNS bloqueado + sin internet) | **PERMANENTE** (14.10 parchea Relapse, sin downgrade) | Watchdog/log DNS: consultas `ps5.update` BLOCKED | Mantener DNS manual; nunca aceptar el aviso de update; conectar a internet solo con DNS de la PC |
| P7 | **SM+ crashea y no se detecta desde PC** (10101 localhost-only) | Media | Juegos .exfat no montan | No detectable desde PC | Síntoma: juego instalado por 12800 no abre → relanzar SM+ por Payload Manager |
| P8 | **Disco de la PC lleno** durante extracción | Media (C: 448 GB, juegos de 40–80 GB) | Instalaciones abortadas | `audit_full.py --telegram` | Flujo 1x1 ya en piedra; verificar espacio antes de cada cola |
| P9 | **PID reciclado en pidfile** → autostart cree que hay watchdog vivo | Baja | Sin watchdog real | `--status` muestra pid muerto | `Test-PidAlive` ya verifica existencia del proceso; el keepalive de 15 min acota la ventana |
| P10 | **Doble lanzamiento de payload** (repair mientras la cadena autoload corre) | Baja | Envío duplicado de kstuff | `autoload_status` `current` | Cooldown 10 min + la consola ignora relanzamientos del mismo ELF (observado) |

## 5. Runbook de recuperación (imprimir y pegar junto a la PS5)

**Síntoma A — no hay jailbreak tras reiniciar la consola:**
1. Cable/Wi-Fi con interfaz activa (Relapse lo exige). 2. Abrir **WebKit Autoloader** y esperar las 5 notificaciones. 3. Verificar en PC: `node pipeline/scripts/kstuff_watchdog.js --status`.

**Síntoma B — juegos instalados no arrancan:**
1. ¿Se abrió el Autoloader esta sesión? 2. FTP: leer `/data/shadowmount/config.ini` (`kstuff_game_auto_toggle=0`). 3. Payload Manager (GUI) → relanzar kstuff → probar de nuevo. 4. Último recurso: reboot y Autoloader.

**Síntoma C — Autoloader no carga la página (caso P1):**
1. PC: verificar host (TCP 443 en 192.168.2.1 vivo; reglas firewall). 2. PS5: red con DNS manual `192.168.2.1` → Guía del usuario → reinstala la app. 3. Volver a DNS muerto/Wi-Fi y NO borrar datos del navegador.

**Síntoma D — el watchdog avisa "sin jailbreak activo":**
Solo significa que 8084 está cerrado: la sesión murió o la consola reinició. Abrir Autoloader; la cadena corre sola.

## 6. Estado final tras la auditoría

| Componente | Estado |
|---|---|
| Watchdog nuevo (PID 16332) | ✅ vivo, primer barrido limpio, excepciones neutralizadas |
| Keepalive `PS5_PC_Pipeline_Loop` (15 min) | ✅ creado, próxima ejecución 16:50 |
| package.json + npm scripts | ✅ creados; `npm test` 33/33 |
| Doc (PS5_PIPELINE.md / HISTORIAL §18) | ✅ actualizados |
| Consola | ✅ intacta, sin tocar (read-only), juegos descargándose sin interferencias |

**Regla de oro que sigue en pie:** no actualizar firmware (14.10), no borrar datos del navegador, interfaz de red activa al abrir el Autoloader, y cuando salga Kstuff-NG oficial → subirlo y ponerlo primero en el autoload.

## 7. Evaluación Y2JB 1.6 (Gezine) — decisión: NO instalar (3-oct)

**Qué es:** otra puerta userland que vive DENTRO del app de YouTube (modifica `download0.dat` en `/user/download/PPSA01650`). En 13.40 sigue necesitando Relapse para el kernel (su kernel propio, Lapse, solo llega a 10.01). No aporta nada nuevo al kernel — es otra puerta a la misma casa.

**Diferencias con el WebKit Autoloader actual:**

| | WebKit Autoloader (actual) | Y2JB 1.6 |
|---|---|---|
| Entrada | Navegador (página cacheada) | App YouTube (webview) |
| Kernel 13.40 | Relapse | Relapse (Lapse solo ≤10.01) |
| Flujo diario | 1 toque → cadena completa automática | Necesita PC para enviar payloads (js loader :50000 / elfldr :9021) cada boot |
| Persistencia | Muere si borran datos del navegador | Sobrevive a eso, pero muere si el app se actualiza (softlock) |
| Instalación | Ya hecha y verificada | YouTube PKG 01.000.030 + cuenta fake-activada (requiere etaHEN toolbox, que se decidió no instalar) + `appinfo_editor.py` con riesgo documentado de **corromper la BD de apps y borrar TODOS los juegos/savedata** |

**¿Se pierde el app de YouTube?** No se elimina — el exploit vive dentro de él. Pero en esta consola el YouTube real ya no funciona (sin internet/PSN: nunca), así que no se pierde nada funcional. El riesgo real es el inverso: si la consola toca internet sin DNS bloqueado, el app puede actualizarse y softlockearse.

**Veredicto:** como reemplazo NO (el Autoloader es más automático, 100% local, ya verificado). Como plan B tampoco compensa: cubriría P1 (borrado de caché del navegador) pero la instalación arriesga todos los juegos instalados y la recuperación vía host DNS+HTTPS tarda 5 min. Re-evaluar solo si Y2JB llegara a ofrecer carga automática de la cadena sin PC en 13.40.
