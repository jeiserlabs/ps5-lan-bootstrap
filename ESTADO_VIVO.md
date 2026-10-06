# ESTADO_VIVO — PIPELINE PS5 AUTONOMO
ts: 2026-10-06T13:45:00-05:00
host: PC Jeiser (Windows 11 AMD64)
red_pc: Casa WiFi tarjeta de red (IDM, sin pantalla azul) · tether USB ELIMINADO (sin ADB, sin scripts)
lan_ps5: Ethernet directa 192.168.2.1 <-> 192.168.2.2 (1 Gbps OK)
ps5_fw: 13.40 Slim · WebKit Autoloader 0.5.2 (:8084) · pkg-receiver (:12800 idle) · ftpsrv (:2121 OK) · elfldr (:9021 cerrado = consola sin jailbreak este boot o apagada)
ssot: data/cache/ps5/installed_pkgs.json (38 verificados FTP) + ps5_ground_truth_audit.json (fresco 06-oct 13:3x)

## 1. CONSOLA (Auditoria FTP fresca 06-oct: audit_orphans + cruel_audit_ssot)
Bases reales (10): Spider-Man 40.44G · Bloodborne 29.20G (app.pkg OK) · GOW 2018 36.06G · A Way Out 15.81G · Tsushima DC 45.31G · CTR 12.59G · It Takes Two 34.33G · Haven 4.31G · HFW 71.27G · MLB 24 48.33G.
Updates vinculados (5, CERO huerfanos): Spider-Man 15.71G · A Way Out 0.11G · CTR 7.94G · HFW 2.44G · MLB 24 33.92G. Bloodborne SIN patch (update nunca entro; entrada falsa en SSOT ya corregida).
DLCs: 19 vinculados OK + 1 HUERFANO: CUSA00900 SPEXPANSIONDLC03 (DLC USA sobre base EUR CUSA03173 — inservible, no instalar).
Stubs sistema 0 bytes (11, inofensivos): CUSA06210/07410/08004/10416/20499/23464/57220/FAKE10101/PKGS12800/PLDM00001/WKAL00001.
Almacenamiento PS5 (usuario): ~323 GB libres + ~90 GB en Otros (temp/savedata/sistema, /user/download y /data/download limpios).
Regla: PKG verificado en PS5 se borra del PC. Aplicado: base Bloodborne 29.20 GB eliminada de C:\Biblioteca_Juegos_PS.

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
