# Historial completo — Jailbreak PS5 13.40

**Consola:** PS5 Slim (de disco) · Firmware **13.40** (v26.04-13.40.00.02)
**Fecha de la sesión:** 1 de octubre de 2026
**Conexión:** cable LAN directo PC ↔ PS5
**Agente:** Buffy (Codebuff)

---

## 0. Datos de red (base de todo)

| Equipo | IP | Detalle |
|---|---|---|
| PC (este equipo) | `192.168.2.1` | Adaptador Intel I211 (cable directo, sin puerta de enlace) |
| PS5 | `192.168.2.2` | MAC `0C:70:43:08:21:0C` = **Sony Interactive Entertainment** (verificado por OUI), ping 0 ms |
| Internet de la PC | `192.168.122.103` | Otro adaptador (USB/RNDIS) — **la PS5 NO tiene internet** |

**La PS5 no tiene salida a internet** (enlace directo sin NAT) → no puede actualizarse sola ni descargar nada; todo se le sirve desde la PC.

---

## 1. Investigación inicial (estado de la escena)

- **Fuentes web:** Kotaku (29/09/2026), Tom's Hardware, TechPowerUp, Korben, GBAtemp, r/PS5_Jailbreak, GitHub.
- **Resultado clave:** el jailbreak **"Relapse"** (29 sep 2026) funciona en **firmware 7.00–13.60** → la **13.40 es explotable**. Solo el **14.00** (16 sep 2026) lo parchea.
- Tabla de qué cubre cada exploit (por eso no hay alternativa mejor en 13.40):

| Exploit | Firmwares | 13.40 |
|---|---|---|
| umtx2 | 1.00–5.50 | ❌ |
| Poops (slopkit) | 7.00–12.00 | ❌ |
| P2JB | 9.00–12.70 | ❌ |
| BD-JB | antiguo, parcheado | ❌ |
| Y2JB (userland, app YouTube) | hasta 13.40/13.42 | ⚠️ solo userland; el kernel sigue siendo Relapse |
| **Relapse** | **7.00–13.60** | ✅ cadena completa |

- **Limitaciones conocidas de 13.40:** no hay jailbreak permanente (tethered), no hay GoldHEN para PS5, no arrancan juegos PS5 FPKG ("PPKG no activo aún"); los **PS4 .pkg sí**.

## 2. Scraping de los canales de YouTube (con yt-dlp)

Se listaron todos los videos de los 3 canales pedidos y se bajaron transcripciones:

| Canal | Videos listados | Archivo |
|---|---|---|
| @NanospeedGamer | 5.193 | `scraping/NanospeedGamer.txt` |
| @PLAYNOWTOOLS | 209 | `scraping/PLAYNOWTOOLS.txt` |
| @MODDEDWARFARE | 974 | `scraping/MODDEDWARFARE.txt` |

- Transcripción **completa** del tutorial en español *"JAILBREAK PS5 13.60 a 7.00 SIN PC - SIN USB"* (PLAYNOWTOOLS, 01/10/2026): `scraping/sdnS9u-sGIU.txt`
- Otros videos clave: *"PS5 13.60 Relapse Autoloader Released"* (MODDEDWARFARE, 30/09, `lWZ9B9vcVfw`), *"Nuevo WebKIT EXPLOIT Autoloader 0.5.2 - Tutorial de INSTALACIÓN"* (NanospeedGamer, 01/10, `EphjVTsoF-w`).
- ⚠️ Los subtítulos de otros videos dieron **HTTP 429** (rate limit de YouTube) — no se pudieron bajar más transcripciones.

**Datos extraídos de las descripciones:**
- WebKit Autoloader: `github.com/itsPLK/ps5-webkit-autoloader/releases`
- DNS públicos del método "solo consola": `45.56.67.85`, `62.210.38.117`
- Payloads recomendados: nanoDNS, kstuff-lite, ShadowMountPlus, onionHEN.

## 3. Método elegido

**WebKit Autoloader v0.5.2** (itsPLK, 30 sep 2026) + exploit **Relapse**:
- Instala una **app en el inicio de la PS5** → no hay que abrir la Guía del usuario nunca más.
- 100% offline tras la instalación (página cacheada en la consola).
- En firmwares 12.02–13.60 usa Relapse, que **necesita interfaz de red activa** (no internet).
- Fue el más estable de su saga: **0.5.0 y 0.5.1 crasheaban**; 0.5.2 arregla eso (reportes de 99% de éxito en su hilo de feedback).

## 4. Preparación de la PC

1. **Descargas** en `ps5-host/`:
   - `webkit-autoloader-host_v0.5.2.exe` (11,8 MB)
   - `webkit-autoloader-host_v0.5.2.py` (4,4 MB, código revisado antes de ejecutar)
2. **Revisión de seguridad del código:** solo hace 1 llamada externa (update check → desactivado con `--no-update-check`) y genera el certificado con openssl (pero **trae certificado embebido**). Cert: `CN=manuals.playstation.net`, autofirmado, válido 30/09/2026 → 27/09/2036.
3. **Firewall (con tu permiso vía elevación)** — 2 reglas de entrada SOLO para la subred del cable:
   ```
   PS5 Autoloader DNS    UDP 53   RemoteAddress 192.168.2.0/24
   PS5 Autoloader HTTPS  TCP 443  RemoteAddress 192.168.2.0/24
   ```
   Deshacer:
   ```
   netsh advfirewall firewall delete rule name="PS5 Autoloader DNS"
   netsh advfirewall firewall delete rule name="PS5 Autoloader HTTPS"
   ```
4. **Lanzamiento del host** (verificado: DNS responde `manuals.playstation.net → 192.168.2.1`, todo lo demás **NXDOMAIN** = bloqueo de actualizaciones/PSN/telemetría; HTTPS sirve la página "WebKit Autoloader v0.5.2", HTTP 200).

### ⚠️ Bug encontrado y resuelto
El `.exe` (PyInstaller) **revienta al redirigir logs a archivo** en Windows español:
```
UnicodeEncodeError: 'charmap' codec can't encode characters ... encodings/cp1252.py
  File "show_splash"  (banner con caracteres ─ │ del banner)
```
`PYTHONUTF8=1` y `PYTHONIOENCODING=utf-8` **no** lo arreglan (PyInstaller lo ignora).
**Solución usada:** lanzar el `.py` con Python del sistema en modo UTF-8 y logs a archivo:

```bash
powershell -NoProfile -Command "Start-Process -FilePath 'C:\Python314\python.exe' `
  -ArgumentList '-X','utf8','webkit-autoloader-host_v0.5.2.py','--ip','192.168.2.1',`
                 '--no-update-check','--verbose' `
  -WorkingDirectory 'E:\ps5\ps5-host' `
  -RedirectStandardOutput 'E:\ps5\ps5-host\host.log' `
  -RedirectStandardError  'E:\ps5\ps5-host\host.err' -WindowStyle Hidden"
```

- Log: `ps5-host/host.log` (verbose: cada consulta DNS y cada petición HTTP).
- Evidencia en log: la PS5 nos usa como DNS (cientenas de consultas `ps5.np.playstation.net`, `telemetry-console...`, `uef.np.dl...` → **todas BLOCKED**).

## 5. Instalación de la app en la PS5 (tu parte)

Preparación: confirmar 13.40 → desactivar actualizaciones automáticas → limpiar cookies/datos del navegador → red LAN con **DNS manual `192.168.2.1`** → **Ajustes → Guía y avisos → Guía del usuario** → carga el instalador → la consola reinicia → aparecen las apps **WebKit Autoloader** y **Payload Manager** en el inicio.

> Nota: la instalación ocurrió durante la primera instancia del host (ventana visible, 16:36–16:42), **antes** de activar el log a archivo, por eso `host.log` no contiene esa petición. Desde entonces la consola solo genera tráfico DNS bloqueado (la página ya está cacheada).

## 6. Diagnóstico del problema de kstuff (juegos no arrancaban)

**Síntoma:** "todos los payloads funcionan menos kstuff" → los juegos ya instalados no ejecutaban.

**Hallazgo en la USB:**
```
/d/kstuff.elf       1.671.136 bytes   11 sep 2026  ← versión ≤1.10
/d/payloads/kstuff.elf  idem
autoload.txt: kstuff.elf / !2000 / pkg-receiver.elf
```
- **Kstuff Lite ≤1.10 = "Supports Firmware 3.00–12.70"** → en **13.40 se carga pero no hace nada** (fallo silencioso).
- **Kstuff Lite v1.11** (20 sep 2026) = *"Added 13.xx Support"*, cubre **1.00–13.60**.

**Acciones:**
1. Descargado `kstuff.elf` **v1.11** → `payloads/kstuff.elf` (1.737.080 bytes, `sha256 ab9a6cb4…`, ELF64 x86-64).
2. Reemplazadas las **3 copias** de la USB (raíz, `payloads/`, `ps5_autoloader/`) — hash verificado en las 3.
3. Delay de `autoload.txt` **`!2000` → `!5000`** (consejo anti-kernel-panic del tutorial en español).
4. USB expulsada de la PC y llevada a la consola.

> Descubrimiento posterior: `/data/ps5_autoloader/kstuff.elf` en el interno **ya era la v1.11** (hash `ab9a6cb4` verificado por FTP). La copia vieja era la de la USB.

## 7. Migración al almacenamiento interno (sin USB)

**Descubierto:** el Payload Manager de la PS5 corre un **servidor web en el puerto 8084** accesible desde la PC (lo abrió itemzflow / el propio gestor). Título: *"Payload Manager v0.5.2 by PLK"*.

### API REST del Payload Manager (base `http://192.168.2.2:8084`)

| Endpoint | Método | Función |
|---|---|---|
| `/version` | GET | versión (0.5.2) |
| `/get_config` | GET | config completa |
| `/set_config` | POST JSON | guarda config (AUTOLOAD_*, SCAN_USB_*) |
| `/list_payloads` | GET | rutas de payloads (interno + USB) |
| `/autoload_status` | GET | estado de la cadena |
| `/usb_move_check?path=` | GET | comprueba mover de USB → interno |
| `/usb_move_perform?path=&overwrite=&keep_original=` | GET | **mueve/copia de USB al interno** |
| `/loadpayload:<ruta>` | GET | **lanza un payload ya** |
| `/manage:upload?filename=` | POST octet-stream | **sube un .elf desde la PC** (¡sin USB!) |
| `/repository_payloads`, `/sources_list`, `/history_list`… | GET | catálogo e historial |

### Secuencia ejecutada
1. `set_config {"SCAN_USB_PAYLOADS": true}` → `list_payloads` mostró `/mnt/usb0/kstuff.elf`, `/mnt/usb0/pkg-receiver.elf`, installer.
2. `usb_move_perform` de **kstuff.elf** y **pkg-receiver.elf** con `keep_original=1` → `{"ok":true,"message":"Moved successfully"}` → quedaron en:
   - `/data/pldmgr/payloads/kstuff/kstuff.elf`
   - `/data/pldmgr/payloads/pkg-receiver/pkg-receiver.elf`
3. Config final del autoload:
   ```json
   {"AUTOLOAD_ENABLED": true,
    "AUTOLOAD_LIST": "kstuff.elf,pkg-receiver.elf,ftpsrv-ps5.elf",
    "AUTOLOAD_DELAY": 5,
    "SCAN_USB_PAYLOADS": false}
   ```
   (formato de la lista: nombres separados por coma; delays como `!ms`; `AUTOLOAD_DELAY` = segundos entre payloads, botones UI [3,5,10]).

## 8. Decisión: NO meter HEN (etaHEN/onionHEN)

- Con **Debug Settings + kstuff** ya se instala y ejecuta juegos → suficiente para jugar.
- Un HEN solo añadía: FTP, toolbox, overlays, cheats, plugins.
- **etaHEN 2.6b** → soporte oficial hasta **12.70** (en 13.40 funciona sin soporte oficial, con avisos puntuales). **OnionHEN** (fork moderno, v0.0.13) → el que enlazan los tutoriales de 13.60; **incompatible** entre sí (plugins).
- **Decisión: no añadir HEN.** El FTP se resolvió aparte con un payload standalone (ver §9).

## 9. FTP instalado (payload standalone, sin HEN)

**Payload elegido:** [`ps5-payload-dev/ftpsrv`](https://github.com/ps5-payload-dev/ftpsrv) **v0.21.1** (20 ago 2026) — el FTP estándar de la escena, mínimo, probado con FileZilla/curl/Thunar.
- **Puerto: `2121`** (no 1337)
- Características: `SELF` (descifra SELF→ELF al vuelo), `MTRW` (remonta /system escribible), `KILL` (para el servidor).

**Instalación completa desde la PC (sin USB):**
1. Descarga → `payloads/ftpsrv-ps5.elf` (191.864 bytes, ELF64, `sha256 7d4b31c8…`).
2. `POST /manage:upload?filename=ftpsrv-ps5.elf` con los bytes → **HTTP 200** → quedó en `/data/pldmgr/payloads/ftpsrv/ftpsrv-ps5.elf` (`install_source: web_upload`).
3. `GET /loadpayload:/data/pldmgr/payloads/ftpsrv/ftpsrv-ps5.elf` → **HTTP 200**.
4. **Prueba superada desde la PC:**
   ```
   220-Welcome to ftpsrv.elf running on pid 123
   220-Version: v0.21.1 (built Aug 20 2026)
   LOGIN anonymous OK · LIST / , /data, /data/pldmgr/payloads, /user/home ✅
   ```
   (⚠️ `NLST` NO está soportado → usar `LIST <ruta>` / FileZilla lo hace bien.)
5. Añadido a la cadena de autoload.

**Uso desde la PC:** FileZilla/Explorador → `ftp://192.168.2.2:2121` → usuario anónimo → todo el sistema de archivos de la PS5 (`/data`, `/mnt`, `/user/home`…).

## 10. Unificación final (dos cadenas que competían)

**Hallazgo:** existía `/data/ps5_autoloader/autoload.txt` (creado 30 sep, **prioritario** según el README del autoloader) con la cadena `kstuff.elf → !3000 → pldmgr.elf`, que competía con la config del Payload Manager (doble envío de kstuff).

**Acción:** respaldo local en `ps5_autoloader_autoload_BACKUP.txt` y **borrado** de `/data/ps5_autoloader/autoload.txt` (verificado: ya no existe). Quedan solo los `.elf` sueltos ahí (inertes sin el `.txt`).

> Contenido respaldado:
> ```
> # Lista de carga automatica del PS5 WebKit Autoloader
> # Un archivo por linea. Los nombres distinguen mayusculas/minusculas.
> # Las lineas !N son una espera de N milisegundos antes de enviar el siguiente payload.
>
> kstuff.elf
> !3000
> pldmgr.elf
> ```

**Resultado:** un solo mando → el Payload Manager. Verificado:
- `autoload_status` → `"list":"kstuff.elf,pkg-receiver.elf,ftpsrv-ps5.elf","delay":5` y `"total":2,"done":2,"current":"DONE"` (la cadena ya ejecutó en esta sesión).

---

## 11. Estado final (verificado)

| Elemento | Estado |
|---|---|
| App **WebKit Autoloader** en el inicio | ✅ (Relapse, 7.00–13.60) |
| Cadena automática | ✅ `kstuff → 5 s → pkg-receiver → 5 s → ftpsrv` |
| `kstuff.elf` v1.11 (interno) | ✅ `/data/pldmgr/payloads/kstuff/` (hash `ab9a6cb4`) |
| `pkg-receiver.elf` (interno) | ✅ `/data/pldmgr/payloads/pkg-receiver/` |
| `ftpsrv-ps5.elf` v0.21.1 (interno) | ✅ `/data/pldmgr/payloads/ftpsrv/` |
| **FTP accesible desde la PC** | ✅ `ftp://192.168.2.2:2121` (anónimo) |
| Escaneo de USB | ❌ desactivado (prescindible) |
| `/data/ps5_autoloader/autoload.txt` | eliminado (respaldo local) |
| Host PC (DNS+HTTPS, bloqueo de updates) | ✅ en `ps5-host/host.log` |
| Firewall (2 reglas) | ✅ creadas (comandos de deshacer arriba) |
| HEN (etaHEN/onionHEN) | ❌ decidido no instalar |
| Juegos PS4 .pkg | ✅ vía Debug Settings / Package Installer |
| Juegos PS5 FPKG | ❌ aún no soportados en 13.40 |

## 12. Uso diario

1. Encender PS5 → abrir **WebKit Autoloader** → exploit + cadena solos (esperar notificaciones).
2. FTP: `ftp://192.168.2.2:2121` desde FileZilla/Explorador (solo mientras la sesión está activa).
3. Reinicio = repetir el paso 1 (**tethered**).
4. **Cable LAN puesto siempre** (Relapse necesita interfaz de red).
5. **No actualizar** (14.00 lo parchea).

## 13. Troubleshooting conocido

- Relapse puede **colgar/panic** → apagado 10 s → reintentar. Limpia cookies/datos del navegador entre intentos.
- La app solo vive mientras hay sesión: tras reiniciar, el puerto **8084** y el **2121** están cerrados hasta volver a lanzar la app.
- El host de la PC hay que relanzarlo solo si se apaga la PC (comando en §4).
- Errores 429 al bajar subtítulos con yt-dlp: esperar unos minutos.

## 14. Archivos en el workspace

```
HISTORIAL-JAILBREAK-PS5.md      ← este documento
ps5_autoloader_autoload_BACKUP.txt   respaldo del autoload.txt interno eliminado
scraping/  NanospeedGamer.txt PLAYNOWTOOLS.txt MODDEDWARFARE.txt   (listados de videos)
scraping/  sdnS9u-sGIU.txt   (transcripción completa tutorial ES)
payloads/  kstuff.elf (v1.11)  ftpsrv-ps5.elf (v0.21.1)
internal/  kstuff.elf + autoload.txt   (staging, ya no hace falta)
ps5-host/  webkit-autoloader-host_v0.5.2.py/.exe, host.log, host.err, cert.pem
```

## 15. Fuentes principales

- Kotaku: *PS5 Jailbreak Exploit For Systems Running July 2026 Firmware* (29/09/2026)
- Tom's Hardware / TechPowerUp / Korben (30/09–01/10/2026)
- `github.com/itsPLK/ps5-webkit-autoloader` (README, ARCHITECTURE.md, releases, discussion #21)
- `github.com/ps5-payload-dev/ftpsrv` (README, v0.21.1)
- `github.com/EchoStretch/kstuff-lite` (release v1.11: "Supports Firmware 1.00-13.60")
- `github.com/ntfargo/Relapse-Exploit`
- YouTube: MODDEDWARFARE, NanospeedGamer, PLAYNOWTOOLS (scrapeados con yt-dlp 2026.08.19)
