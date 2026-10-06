# ESTADO_VIVO — PIPELINE PS5 AUTONOMO
ts: 2026-10-06T14:20:00-05:00
host: PC Jeiser (Windows 11 AMD64)
red_pc: Casa WiFi tarjeta de red (IDM, sin pantalla azul) · tether USB ELIMINADO
lan_ps5: Ethernet directa 192.168.2.1 <-> 192.168.2.2 (1 Gbps OK)
ps5_fw: 13.40 Slim · reboot + Autoloader 0.5.2 OK (autoload 4/4 DONE: kstuff/pkg-receiver/ftpsrv/SM+) · pkg-receiver idle · ftpsrv OK · elfldr cerrado (normal: no esta en autoload)
ssot: data/cache/ps5/installed_pkgs.json (37 verificados, BB fuera) + ground truth fresco post-reboot
daemons: server 9898 + watchdog + daemon VIVOS (reiniciados 06-oct con codigo actual; PID stale 13936 eliminado) · aria MUERTO · Telegram verificado (ping enviado OK)
tareas: PS5_PC_Pipeline (logon) + Loop 15min (resucita server/watchdog/daemon via autostart, bloque daemon añadido 06-oct)

## 1. CONSOLA (Auditoria FTP fresca post-reboot 06-oct 14:1x)
Bases reales (13, BB borrado por usuario): Spider-Man 40.44G · GOW 2018 36.06G · A Way Out 15.81G · Tsushima DC 45.31G · CTR 12.59G · It Takes Two 34.33G · Haven 4.31G · HFW 71.27G · MLB 24 48.33G.
Updates vinculados (5, CERO huerfanos): Spider-Man 15.71G · A Way Out 0.11G · CTR 7.94G · HFW 2.44G · MLB 24 33.92G.
DLCs: 19 vinculados OK + 1 HUERFANO: CUSA00900 SPEXPANSIONDLC03 (USA, inservible).
Residuos purgados 06-oct: /user/download/CUSA43942 17.6G + /user/download/CUSA28561 256M (restos de installs ya verificados) — /user/download VACIO. /user/temp solo sistema. Otros PS5 bajando en consecuencia.
Regla: PKG verificado en PS5 se borra del PC.

## 2. PURGA ARIA COMPLETA (06-oct, IDM manda)Motivo: descargas 100% en IDM por tarjeta de red, sin pantalla azul; aria fuera para que nunca robe ancho de banda.
Ejecutado: matados aria2c.exe (PID 9264) + aria_pilot.js (PID 11636); borrados tools/aria2c/aria2c.exe, tools/aria2c/aria2.conf (git rm), data/cache/ps5/aria2.session, aria_pilot.pid; bloque 2b eliminado de pipeline/scripts/ps5_pc_autostart.ps1 (tareas PS5_PC_Pipeline/Loop ya no lo resucitan).
Codigo aria queda dormido en repo (aria_pilot.js, lib/aria_client.js, check_links.js) por si se reactiva algun dia; runtime cero.
Cola: 2 pendientes sin URL (re-mint): HZD-EUR + Miles Morales EUR. Las baja IDM manual; el daemon solo mueve/instala lo que caiga en biblioteca.

## 3. PURGA TETHER COMPLETA (06-oct, ya no hay tether)
Borrados del repo (git rm): pipeline/scripts/adb_auto_tether.ps1, pipeline/scripts/safe_tether_watchdog.ps1.
Borrados logs: data/logs/adb_auto_tether.log, data/logs/tether_watchdog.log. Sin tareas programadas de tether (solo PS5_PC_Pipeline + Loop).

## 4. BIBLIOTECA PC (solo 3 archivos, Desktop y staging limpios)
C:\Biblioteca_Juegos_PS: 2 DLC Ragnarok EUR 0.5 MB c/u (validos, retenidos: sin base CUSA34386). Update BB 1080p60fps PURGADO 06-oct (PS5 lo descargo 100% por LAN y lo rechazo al consolidar; entrada falsa re-eliminada del SSOT, queda 38).
E:\Biblioteca_Juegos_PS: vacia. Desktop: 0 .pkg/.rar/.zip (IDM-only confirmado).

## 4b. IDM EN VUELO (captura 06-oct, 11 archivos ~3.5 MB/s agregados)
GT7 base CUSA10213 43.33G 10.9% · Ragnarok base 84.40G 4.6% · Ragnarok upd 6.05 (rar) 23.56G 15.5% · Valhalla DLC (rar) 8.20G 48.3% · Miles base 3 rar 39.46G (17-26%) · Miles upd+DLC merged 11.20G 26% · MK11 LAT base 36.98G 4.1% + MK11 MOD-update v1.30 32.37G 3.8% (SENTENCIADO: no instalar, ver §6).
Proyeccion PS5: +210G sin MK11 (libre final ~150G) / +279G con MK11 (libre ~80G).

## 5. BLOODBORNE — RESPUESTAS (contexto: PS5 corriendo FPKGs de PS4)
- Sin update SE PUEDE instalar y jugar: la base v1.00 es el juego completo de principio a fin. Verificado: base instalada OK (29.20G, app.pkg presente).
- Sin update SE PUEDE jugar, pero a 30fps con tiempos de carga largos y bugs de la 1.00 (Chalice, caidas puntuales). El update v1.09 oficial corrige eso.
- El update que tienes NO es Sony puro: es 1.09 + parche 60fps de la escena (mismo Title/Content-ID, pasa validacion forense). En PS5 con kstuff es lo recomendado: 30 -> 60fps reales. Necesario? No. Deseable? Mucho.
- Accion: al corregir el SSOT el update quedo pendiente y el daemon vivo lo instalara solo (181 MB, ~1 min, consola idle). Si NO lo quieres, dilo y lo retengo/borro.
- GOTY (verificado en DLPSGame 06-oct): la edicion GOTY EUR es el MISMO CUSA03173 (bundle base + Old Hunters integrado, no requiere DLC separado). JPN Old Hunters Edition es CUSA03014 (evitar). Update correcto = v1.09 de CUSA03173 (el que ya tenemos). Nota escena: updates 60fps modeados a veces exigen repack (reporte CE-36434-0 sobre GOTY); si el 1080p falla, plan B = 720p60fps o 1.09 oficial puro.
- GOTY vs Complete (06-oct): ambas ediciones EUR son el MISMO CUSA03173 con Old Hunters integrado; difieren solo en nombre del release de la escena. No existe Ultimate oficial de Bloodborne. El oficial 1.09 instala en cualquier CUSA03173; lo que el PS5 rechaza es el repack modeado 60fps mal hecho (probado: RANGE 100% + rollback, sin patch.pkg). NO re-descargar base 29 GB (la instalada funciona): traer solo update oficial 1.09 u otro 60fps de mejor fuente.

## 6. SIGUIENTES ACCIONES
1. (auto) Daemon instala Bloodborne Update v1.09 60fps salvo orden contraria.
2. Conseguir DLC The Old Hunters EUR (CUSA03173); el CUSA00900 huerfano no sirve.
3. IDM sigue con HZD-EUR + Miles Morales EUR (links re-mint pendientes).
4. NO reinstalar aria ni tether. NO tocar firmware (14.xx cierra la puerta).
