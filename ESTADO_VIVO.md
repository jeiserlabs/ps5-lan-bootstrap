# ESTADO_VIVO — PIPELINE PS5 AUTONOMO
ts: 2026-10-06T15:00:00-05:00
host: PC Jeiser (Windows 11 AMD64)
red_pc: Tether USB S23 Ultra (comparte WIFI, sin riesgo datos) · Samsung Remote NDIS OK · IDM 1x1 recomendado (cola secuencial, 4 conexiones/archivo)
lan_ps5: Ethernet directa 192.168.2.1 <-> 192.168.2.2 (1 Gbps, ping 0ms OK)
ps5_fw: 13.40 Slim · reboot + Autoloader 0.5.2 OK (autoload 4/4 DONE) · pkg-receiver idle · ftpsrv OK · elfldr cerrado (normal)
ssot: data/cache/ps5/installed_pkgs.json (39 verificados: 11 juegos, Miles incluido) + ground truth fresco
daemons: server + watchdog + daemon VIVOS codigo actual · aria MUERTO · Telegram OK
tareas: PS5_PC_Pipeline (logon) + Loop 15min (resucita server/watchdog/daemon)
juegos_ps5: 11 instalados (10 + Miles Morales base+update/DLC verificados FTP 06-oct). BB borrado. Libre PS5 ~150G proyectado al cerrar tanda (sin MK11).

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

## 4b. IDM EN VUELO (06-oct; OJO: perdida 92G 06-oct tarde)
Tanda: GT7 base CUSA10213 43.33G · Ragnarok base 84.40G · Ragnarok upd 6.05 rar 23.56G (iba 83%) · Valhalla DLC rar 8.20G (COMPLETADO+extraido+validado CUSA34386, retenido sin base) · Miles base 3 rar 39.46G (COMPLETADO, base 38.29G instalada+verificada, rars borrados) · Miles upd+DLC 11.21G (instalado+verificado) · MK11 LAT base 36.98G + MK11 MOD-update v1.30 32.37G (SENTENCIADO: no instalar ni bajar).
INCIDENTE 06-oct: cambio a tether S23 + reinicio IDM mato ~92G de parciales (chunks vaciados, links Akira expirados por sesion/IP). Leccion: links Akira mueren con cambio de red; re-capturar URL frescas con la red final activa. Recuperar en orden: Ragnarok upd → GT7 → Ragnarok base → (MK11 base opcional, MOD jamas).
Proyeccion PS5: +210G sin MK11 (libre final ~150G).

## 5. BLOODBORNE — RESPUESTAS (contexto: PS5 corriendo FPKGs de PS4)
- Sin update SE PUEDE instalar y jugar: la base v1.00 es el juego completo de principio a fin. Verificado: base instalada OK (29.20G, app.pkg presente).
- Sin update SE PUEDE jugar, pero a 30fps con tiempos de carga largos y bugs de la 1.00 (Chalice, caidas puntuales). El update v1.09 oficial corrige eso.
- El update que tienes NO es Sony puro: es 1.09 + parche 60fps de la escena (mismo Title/Content-ID, pasa validacion forense). En PS5 con kstuff es lo recomendado: 30 -> 60fps reales. Necesario? No. Deseable? Mucho.
- Accion: al corregir el SSOT el update quedo pendiente y el daemon vivo lo instalara solo (181 MB, ~1 min, consola idle). Si NO lo quieres, dilo y lo retengo/borro.
- GOTY (verificado en DLPSGame 06-oct): la edicion GOTY EUR es el MISMO CUSA03173 (bundle base + Old Hunters integrado, no requiere DLC separado). JPN Old Hunters Edition es CUSA03014 (evitar). Update correcto = v1.09 de CUSA03173 (el que ya tenemos). Nota escena: updates 60fps modeados a veces exigen repack (reporte CE-36434-0 sobre GOTY); si el 1080p falla, plan B = 720p60fps o 1.09 oficial puro.
- GOTY vs Complete (06-oct): ambas ediciones EUR son el MISMO CUSA03173 con Old Hunters integrado; difieren solo en nombre del release de la escena. No existe Ultimate oficial de Bloodborne. El oficial 1.09 instala en cualquier CUSA03173; lo que el PS5 rechaza es el repack modeado 60fps mal hecho (probado: RANGE 100% + rollback, sin patch.pkg). NO re-descargar base 29 GB (la instalada funciona): traer solo update oficial 1.09 u otro 60fps de mejor fuente.

## 6. SIGUIENTES ACCIONES
1. Re-añadir URLs frescas Akira en IDM (red S23 activa), cola 1x1: Ragnarok upd → GT7 → Ragnarok base → MK11 base opcional. MOD v1.30 JAMAS.
2. Conseguir DLC Old Hunters EUR solo si se reinstala Bloodborne (pendiente decision; base anterior borrada de consola y PC).
3. Fixes aplicados 06-oct: borrado post-install verificado (lan_installer) · EXDEV copy+unlink C:-E: (daemon) · watchDir Desktop (config local) · daemon en autostart.
4. NO reinstalar aria ni tether-scripts. NO tocar firmware. NO borrar datos navegador PS5.
