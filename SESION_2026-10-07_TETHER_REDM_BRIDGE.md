# SESION 2026-10-07 — TETHER S23->REDMI (CAVEMAN ULTRA, respaldo anti-cierre CLI)
ts: 2026-10-07T07:30-05:00 · host: PC Jeiser Win11 · red: Redmi USB RNDIS6 · lan_ps5: 192.168.2.1<->192.168.2.2 OK (0ms)

## HW/RED
- antes: S23 Ultra tether, 10-11MB/s. ahora: Redmi 192.168.31.114->192.168.31.77, 426Mbps link, ~27-61Mbps real (~3-7MB/s fluct).
- driver: wceisvista.inf 2006 (RNDIS5.1, BSOD) -> netrndis.inf 10.0.26100.9444 (NDIS6, OK, 0 err/desc).
- type-C trasero + suspend USB OFF + plan max rend + CUBIC normal. BSOD 0%.
- ping 1.1.1.1: 53-140ms avg74 jitter alto = radio debil, no driver.
- cloudflare 5MB 9.8s lento = WAN general lenta, no AkiraBox.
- causa: Redmi modem debil + mismo WiFi 192.168.1.x compartido S23+Redmi (doble salto) + posible fair-use tras 43GB noche. NO config.

## IDM
- conn: 32->16->8 (HKCU DownloadManager MaxConnectionsNumber=8).
- paralel: 1x1 ->10 ->50 ->4 (Queue FilesAtTheSameTime=4). 4x8=32 sockets, punto medio (2 muere token, 50 mata modem).
- cola 1x1 mato tokens (espera 6h, token 1-2h, HTML 57KB). paralelo obligado.
- cambio fono = cambio IP = tokens viejos 403. refresh obligatorio.
- tareas vivas CLI: 35 base GOW ~1.3MB/s, 36 update6.05 ~1.5MB/s, 37 Valhalla ~1.3MB/s, 38 ALLDLC status3 done.

## JUEGOS
- HZD CUSA10213 base 46.5GB + update 0.31GB: 100% instalado PS5 verif FTP, borrado PC. DONE.
- GOW CUSA34386: base+update6.05+Valhalla bajando (tarea 35/36/37). DLC ALLDLC extraido 12:05Z verif CRC: 4 PKG 0.5MB (US/EU Deluxe+Preorder) en E:\Biblioteca, esperan base (cascada).
- FC27 CUSA57220 part4 10GB .failed truncado -> refresh pendiente.
- Naruto CUSA32836 retenido (HELD_TITLES, no PS5). HTMLs muertos.
- basura Desktop (3xHTML 57KB + 1x.failed 10GB): BORRADA 07:xx. biblio: C 601GB libre, E 418GB libre.

## DAEMONS (vivos, no crear nuevos)
- server.js 1632 + watchdog 20196 + daemon.js 16016, up 53min, autostart no-duplica.
- watchDir Desktop -> libraryDirs C:\+E:\Biblioteca. daemon extrae rar (7z CRC 0=OK), mueve PKG, lan_installer inyecta :12800, verif FTP, borra PC, avisa Telegram.
- pipeline/lib/telegram.js activo (aria/daemon/watchdog/lan_installer avisan).
- PS5 viva ping 0ms. daemons hacen descomprimir+verificar+instalar solos.

## REGLAS
- Naruto NO instalar (espacio). GOW castellano desde cero. FC27 sí, Naruto no.
- IDM: 8 conn, 4 paralel en Redmi. reiniciar IDM tras cambio registro.
- refrescar links con IP Redmi actual, no reutilizar tokens S23.

## LOG POR MENSAJE (append)
- [07:xx] borrada basura Desktop OK. tareas 35-37 activas. pipeline auto OK.
- [07:30] respaldo creado: ESTADO_VIVO actualizado + regla global append-por-mensaje activa.
- [07:35] audit pipeline: 70/70 pass, 2 files >300 lin (aria377/watch360), log 49MB rotar, git 1M+1U (docs sesion). limpio OK.
- [audit-ext] ARIA purgado (no exe, no proc). watchdog regresion confirmada L279/346 elfldr opcional. contexto solo local (1M+1U), no push.
- [07:40] fix watchdog push 752dde9: elfldr en repair+sweep+autoload, 70/70 verde. listo re-audit.
- [08:xx] re-audit 752dde9: push 6ab1de8 (SM+ autoload, audit SSOT, ARIA archived, README 70/70). 70/70 verde.
- [09:xx] re-audit 6ab1de8: push f4b80c2 (triggerPkgInstall, extractor unico, P2 docs). 70/70 verde.
- [10:xx] re-audit f4b80c2: push f2e71b4 (fail-closed estricto, retryable+padding, zipslip recursivo). 73/73 verde.
- [11:xx] msg re-audit truncado, pendiente hallazgos f2e71b4.
- [12:05] contexto OK. suite 82/82 con fixes sin commitear (guarda reentrancia daemon + lectura incremental log lan_installer + fail-fast 120s).
- [12:10] audit GOW: validate_pkgs 7/7 APROBADO (base CUSA34386 84.4GiB, update v6.05 23.6GiB, Valhalla 8.2GiB, DLCs EU Deluxe+Preorder, DLCs US CUSA34384 quedan held). PS5 viva 12800/2121/8084, GOW ausente de /user/app|patch|addcont.
- [12:12] fix extra: lan_installer ordenaba lote por tamaño (DLC 0.5MB antes que UPDATE) -> pkg_rules.installPriority (BASE>FIX>UPDATE>DLC) + 3 tests -> 85/85 verde.
- [12:09] arrancada instalacion GOW en foreground-controlado: lan_installer --title CUSA34386 (PID 20936, log data/logs/gow_install_20260707.log). server.js 9898 PID 9264. NO se arrancan daemon/watchdog (orden del usuario).
- [12:14] intento 1 y [12:25] intento 2: bgft MUERE siempre en el byte 13172211712 (=12562 MiB) tras ~117s y 812 rangos. Identico bit a bit. Purga de staging (playgo + bgft task + /user/download/CUSA43942 18.4GB) y [12:30] intento 3: muere igual. PC-side probes 206 OK durante todo el stall => el que muere es el cliente de la consola, no el server.
- [12:35] DESCUBRIMIENTO: el receiver tiene pull resumible (/api/files/pull, 16 streams de 5.6GB en paralelo, HEAD + rangos) y NO se corta: copia GOW base a /data/homebrew/gow_base_test.pkg a ~90MB/s pasando de largo los 13GB.
- [12:42-12:48] plan B: bajado PKG-Manager_v1.4.1.elf (sha256 verificado, itsPLK), subido por FTP a /data/pldmgr/payloads/pkgmanager/ + json, cargado con PM 8084 (OK). UI/API en :8844 (/api/install, /api/status, /api/packages, /api/upload/*). Helper instala via sceAppInstUtil (log /data/pkgmgr/helper-log.txt).
- [12:55] /api/install valida 'path' y devuelve 'Package file not found' para rutas inexistentes => acepta ruta local. Copia en curso (68.5/90.6 GB).
- [13:20-13:35] contexto OK. GOW EU intento nuevo: muere 13.17 GB con 326 GB libres => NO es espacio/red (byte 13172211712 x3). Diagnostico usuario confirmado: incompatibilidad cliente/hypervisor del PKG EU.
- [13:35-13:42] liberados 131.7 GB: borradas copias prueba /data/homebrew (gow_base_test 90.6 + gow_update_test 25.3 + speedtest) + /user/download/NPXS40140/download0.dat 2.4 GB. Libre 85.8 -> 326.5 GB.
- [13:38] fix pipeline: pkg_rules.requiredHeadroomBytes (pico 2.05x base / 1.5x update-DLC +3 GB) + guarda en lan_installer.installPkg leyendo /api/space ANTES de inyectar => nunca mas llena el SSD. 4 tests nuevos.
- [13:40] fix pipeline: installPkg ahora aplica isModBlocked (antes SOLO el daemon lo filtraba y el orquestador LAN instalo CUSA11518 update ALL.DLC.MOD = el que apaga la consola). +1 test.
- [13:45] PC: cuarentena E:\_cuarentena_ps5\GOW_EU_rechazado_2026-10-07\ con base EU 90.6 GB + update v6.05 + Valhalla + DLCs EU (movidos, nada borrado). Biblioteca E:\ queda solo con DLCs US CUSA34384.
- [13:47] PS5 purga: verificados vacios y borrados 7 stubs /user/app (CUSA08004, 20499, 23464, 57220, 06210, 10416, 07410) + appmeta. /user/download vacio, /data/homebrew limpio. 0 huerfanos (7 patches + 4 addcont todos con app). Libre 326.49 GB.
- [13:50] daemon auditado: ciclo 30 s, extrae rar/zip Desktop, mueve PKG sueltos, instala plan[0] en cascada, NO descarga. Fix nuevo isStillWriting (no instala PKG con mtime <2 min: IDM escribe directo en biblioteca). Tests 92/92 verde. ARRANCADO pid 13036. Retenidos: 2 DLCs US esperando base US.
- [13:55] research compatibilidad: informe COMPATIBILIDAD_PS4_PS5.md (regla misma-CUSA, ledger de 40 intentos, 0x80B2116F=SCE_PLAYGO_ERROR_CORE_INVALID_SLOT en ruta programatica, CE-100022-5 al lanzar, fallback Package Installer de consola, MK11 ALLDLC.MOD, Bloodborne 60fps patch, HZD 10213 si / 01967 no en 37.88 GB).
- [14:00] Telegram enviado: limpieza + lista 11 juegos completados (419 GB) + daemon + hallazgos compatibilidad. Pendiente: 2 descargas IDM CUSA34384 (base A0100 + update A0605) -> instalacion automatica por daemon.
- [14:00] PC audit por orden usuario: borrada cuarentena EU completa 117 GB (base CUSA34386 90.6 + update v6.05 25.3 + Valhalla 8.8 + DLCs EU). Manifiesto data/cache/ps5/purged_pc_2026-10-07.txt. E: 302 -> 418 GB libres.
- [14:05] repo limpieza: data/logs 54 MB -> 5.3 MB (ps5_pipeline.log 52 MB + aria2 + aria_pilot + autostart a data/logs/archive/*.gz). Sin .failed ni parciales. Conservados: 2 DLCs US CUSA34384 + descargas IDM en curso + data/browser_profiles (sesiones).
- [14:08] SSOT reauditado FTP 1:1 -> installed_pkgs.json 39 entradas verificadas (11 bases + 7 updates + 21 DLC/homebrew). Informe legible nuevo SSOT_JUEGOS_PS5.md (ordenado por tamaño: HFW 71.27, MLB 48.33, GoT 45.31, HZD 43.34, Spider-Man 40.44, Miles 38.29, GoW2018 36.06, ItTakesTwo 34.33, A Way Out 15.81, CTR 12.59, Haven 4.31; updates 71.62 GB).
- [14:12] Telegram x2: (1) explicacion tecnica PS4-si/PS5-no (PS4 kernel parcheado GoldHEN vs stack PS5 AppInst/PlayGo con hypervisor+entitlement; 0x80B2116F SCE_PLAYGO_ERROR_CORE_INVALID_SLOT en ruta HTTP vs Package Installer local si; CE-107880-4 region/DLC; evidencia byte 13.172.211.712 x3 con 326 GB libres) (2) resumen limpieza+SSOT.
- [14:15] hallazgo NO tocado: DLC huerfano CUSA09303.zip 315 KB en Downloads/05_Imagenes/Telegram_Descargas (fuera de biblioteca, no instalado). Esperando decision.
- [14:20] PURGA "lo que no sirve" por orden usuario. Repo 490M -> 330M: audit_tmp .elf (duplicados exactos de payloads/, verificado con cmp) + last_audit*.json, forensic/ 18M (snapshot oct-2 superado por la auditoria viva), repomix_ps5.txt 884K (dump generado), internal/kstuff.elf (dup exacto de payloads/kstuff.elf), ps5-host/__pycache__ 3.9M, caches de navegador ~60M (Cache/Code Cache/GPUCache/ShaderCache/Crashpad), tools/external/webkit-autoloader-host.exe 12M (dup exacto de ps5-host/). Manifiesto: data/cache/ps5/purged_repo_2026-10-07.txt.
- [14:21] borrado DLC huerfano CUSA09303.zip 315K (Downloads/Telegram_Descargas, no instalado). NO tocado: sesiones de browser_profiles (Cookies/Login Data intactos), payloads/, data/backups/, tools/external/PkgSender (93M, herramienta GUI del usuario), descargas IDM en curso, 2 DLCs US pendientes.
- [15:50] IMPLEMENTADO filtro de compatibilidad del informe externo, pero DATA-DRIVEN: nuevo pipeline/lib/ps5_compatibility.js con 3 niveles (block/warn/info). block SOLO con evidencia local determinista -> hoy unicamente CUSA34386 (13.17 GB x3). La blocklist de foros del informe (CUSA13323 GoT, CUSA07408 GoW2018, CUSA28561 HFW, CUSA13795 CTR, CUSA16742, CUSA20499) NO se implemento como bloqueo: la auditoria FTP demuestra que los 6 estan instalados y funcionando en esta FW 13.40 -> bloquearlos habria roto juegos reales (y el propio parche de GoW2018 que el informe pedia instalar). Quedan como 'info' en SCENE_REPORTS + test anti-contaminacion.
- [15:52] Enganches: lan_installer.installPkg bloquea ANTES de la guarda de espacio (no descarga el PKG) y avisa por Telegram; pkg_validator anota info.compatibility y solo rechaza con {enforceCompatibility:true}; daemon hereda la guarda porque delega en installPkg. CLI nuevo `npm run ps5:compat` (compat_audit.js) cruza el filtro con el ledger real y falla si algun titulo INSTALADO OK quedara bloqueado.
- [15:53] Hallazgo del parser: CUSA10213 (HZD, instalado OK) tenia 927 estancamientos 'deterministas' a 3.32 GB -> era el bug de reentrancia del daemon, no rechazo del titulo. El CLI ahora muestra histograma por clusters (3.32 GB x31 = reentrancia vs 13.18 GB x3 = rechazo real) y marca explicitamente la banda de reentrancia. Sin esto el filtro habria bloqueado HZD por error.
- [15:54] Verificacion de FIRMWARE en update_payloads.js (el SHA256 solo probaba integridad): todos los payloads validados contra payloads/compatibility.json + cfg.ps5.firmware (nuevo, override PS5_FIRMWARE) -> 4/4 OK en FW 13.40; con --apply aborta si alguno no soporta el FW. Anadida entrada webkit-autoloader a la matriz (antes 'sin datos').
- [15:55] Tests 108/108 verde (antes 92; +16 en pipeline/tests/ps5_compatibility.test.js). E2E por el punto de entrada real (installPkg, dry-run): CUSA34386 -> false (bloqueado sin descargar), CUSA07408 -> true (GoW2018 sigue permitido), CUSA34384 -> true con aviso (la descarga US en curso NO se bloquea). Sonda real PS5 OK: 326.49 GB libres, receiver idle, PM 0.5.2, build 20260921-03, ftp 2121 True.
- [15:56] Daemon relanzado DESACOPLADO (Start-Process) para cargar el codigo nuevo: pid 13036 parado -> pid 23880 (pidfile OK, ciclo 30 s, 39 instalados, 0 planificados, 2 DLCs US retenidos). Motivo: Node no recarga require() en caliente; el daemon viejo habria instalado sin el filtro. server 9898 sigue vivo (pid 9264). kstuff_watchdog sigue OFF a proposito.
- [15:57] Docs: VERIFICATION.md nuevo (comandos + salidas reales + LIMITES: no se instalo ningun PKG real, NO se corrio watchdog --once porque elfldr 9021 esta cerrado a proposito y el barrido re-inyecta la cadena; sin tests de FTP), COMPATIBILIDAD_PS4_PS5.md seccion 6 (semantica del filtro + por que la lista de foros no bloquea), ESTADO_VIVO.md y CHANGELOG.md actualizados. Sin commit (working tree).
- [17:00] Auditoria e2e orden usuario GoW 2018 + IDM: (1) PS5 ya tiene CUSA07408 (GoW 2018 USA) instalado 100% (38.72 GB + 8 DLCs v1.00 base pura). (2) Descarga IDM pastegratis.link/?v=289: usgw4.part1..8 analizado con 7z y password BlueMagic -> es GOD OF WAR - CUSA07408.pkg (38.72 GB) = 100% REDUNDANTE (40 GB de base ya instalada). (3) Update v1.34 (usgw4u134.rar 7.75 GB) o v1.35 SI sirve para vincular a la base instalada CUSA07408 sin volver a descargar la base. (4) Bugfix archive_extractor.js: 7z l -slt corria sin contraseñas y crasheaba con 255 en archives cifrados (BlockEncryption) marcandolos .failed; ahora prueba BlueMagic/loquitoRETROgamer y -p-, devolviendo retryable:true ante Missing volume. Daemon relanzado pid 3588. Tests 111/111 verde.
