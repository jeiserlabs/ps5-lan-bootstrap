# ESTADO_VIVO — PIPELINE PS5 AUTONOMO (CAVEMAN ULTRA)
ts: 2026-10-05T22:12:00-05:00
host: PC Jeiser (Windows 10/11)
lan_ps5: 192.168.2.2 (Gigabit directo 192.168.2.1, Intel I211, 0ms ping)
ps5_fw: 13.40 Slim (v26.04-13.40.00.02) · WebKit Autoloader v0.5.2 · kstuff 1.11 (EchoStretch)
puertos_ps5: 8084 PMGR | 12800 pkg-receiver | 2121 ftpsrv | 9021 elfldr
ssot_file: data/cache/ps5/installed_pkgs.json (100% sincrono con hardware PS5)

## 1. INVENTARIO PS5 AUDITADO 100% (11 JUEGOS BASE OPERATIVOS — 374 GB)
1. CUSA02299 (Spider-Man 2018): Base 40.44 GB + Update v1.19 60fps 15.71 GB + 4 DLCs OK
2. CUSA07408 (God of War 2018): Base v1.00 36.06 GB + 8 DLCs armaduras/escudos OK (60fps latino).
   * CUSA07410 EUR descartado: no tiene doblaje latino y requeria 40GB redownload. Base USA v1.00 es la definitiva.
3. CUSA13323 (Ghost of Tsushima DC): Base 45.31 GB + DLC Isla de Iki OK.
   * Version base v1.00 ya incluye expansion Iki Island completa. Update 2.24 en PC era solo un backport eboot de 42MB.
4. CUSA28561 (Horizon Forbidden West): Base 71.27 GB + Update v1.18 2.44 GB + 2 DLCs OK
5. CUSA11518 (Mortal Kombat 11 Ultimate): Base 36.99 GB + Update v1.30 All DLC Mod 32.38 GB OK
6. CUSA43942 (MLB The Show 24): Base 48.33 GB + Update v1.21 33.92 GB OK
7. CUSA13795 (CTR Nitro-Fueled): Base 12.59 GB + Update v1.21 7.94 GB + 3 DLCs OK
8. CUSA16742 (It Takes Two): Base 34.33 GB v1.00 OK
9. CUSA07995 (A Way Out): Base 15.81 GB + Update v1.01 0.11 GB OK
10. CUSA23384 (Haven): Base 4.31 GB v1.06 Couples update OK
11. SLUG51851 (Carritos N64): Base 0.03 GB OK
* Apps sistema: ITEM00001 (0.06 GB), NPXS39041 (0.04 GB), NPXS40172 (0.00 GB).
* Updates huerfanos: 0. DLCs huerfanos: 0.

## 2. PURGA ALMACENAMIENTO RESIDUAL PS5 (20.9 GB RECUPERADOS)
* /user/download/CUSA43942: 18.5 GB borrados (download0.dat + download1.dat).
* /user/download/NPXS40140: 2.3 GB borrados (download0.dat).
* /user/download/CUSA57220: 8 bytes borrados.
* /user/patch/: 4 carpetas stubs vacias eliminadas (CUSA07410, CUSA08004, CUSA20499, CUSA57220).
* Estado /user/download tras purga: 100% LIMPIO (0 bytes).
* Almacenamiento libre PS5: SSD recupero ~21 GB netos.

## 3. CAUSA RAIZ APAGADOS EN SECO (DESMITIFICADO Y RESUELTO)
* MITO: Sobrecarga o saturacion de red. (FALSO).
* CAUSA REAL: Inyeccion LAN de PKG incompleto (CUSA03173 Bloodborne base).
  - Archivo en PC tenia 29GB preasignados por aria2 pero solo 633MB reales bajados.
  - Al llegar al byte 633MB, PS5 disparo 25 Range Requests repetidos, scePfs kernel entro en panico por datos vacios PlayGo y apago hardware en seco por proteccion.
* MITIGACION: PKG incompleto aislado en E:\staging\_quarantine_incomplete. Prohibido enviar PKGs a PS5 sin verificar descarga 100% terminada.

## 4. DESCARGA EN CURSO EN PC: BLOODBORNE (CUSA03173 EUR GOTY)
* Plan acordado:
  1. Base: Akia 2bJG8VOr3OBE (29.20 GB) -> EN DESCARGA ACTIVA.
  2. Update: Update 1.09 1080p 60fps (Akia 9QWmpeNx3EB6, ~9.5 GB) -> Pendiente generar token cuando base termine.
  3. DLC: The Old Hunters (Akia b5Ozden4GB8L) -> Pendiente generar token cuando base termine.
  * Descartados: Update 720p (para PS4 fat), Update 30fps fix, Update 1.09 normal.
* Estado descarga PC:
  - Destino: E:\staging\bloodborne_clean\CUSA03173-Game-PRELUDE-[DLPSGAME.COM].pkg
  - Gestor: Aria2 RPC (localhost:6800).
  - Modo: 1 stream continuo estable (evita rate-limit / stalls de AkiraBox CDN).
  - PS5: 100% aislada, 0 trafico enviado, consola estable.

## 5. PENDIENTE WAN FUTURO (OTRAS BASES LIMPIAS)
* Spider-Man Miles Morales (CUSA17722): Base Partes 1 y 2 (~15 GB). Update v1.14 ya listo.
* God of War Ragnarok (CUSA34384): Base limpia 90 GB. Update v6.05 ya listo.
* Horizon Zero Dawn (CUSA01967): Base limpia 40 GB. Update v1.54 y 10 DLCs ya listos.

## 6. HERRAMIENTAS Y SCRIPTS OPERATIVOS EN REPO
* pipeline/scripts/cruel_audit_ssot.py: Auditoria FTP 1:1 y sincronizacion SSOT.
* pipeline/scripts/audit_orphans_ps5.py: Deteccion de huerfanos y residuos en PS5.
* pipeline/scripts/purge_download_cache.py: Limpieza de /user/download via FTP.
