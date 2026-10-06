# ESTADO_VIVO — PIPELINE PS5 AUTÓNOMO (CAVEMAN ULTRA)
ts: 2026-10-05T21:13:00-05:00
host: PC Jeiser (Windows 10/11)
lan_ps5: 192.168.2.2 (Gigabit directo 192.168.2.1, Intel I211, 0ms ping)
ps5_fw: 13.40 Slim (v26.04-13.40.00.02) · WebKit Autoloader v0.5.2 · kstuff 1.11 (EchoStretch)
puertos_ps5: 8084 PMGR | 12800 pkg-receiver | 2121 ftpsrv | 9021 elfldr
pkg_server: http://192.168.2.1:9898 (Multi-Drive HTTP streaming C: + E:)
ssot_file: data/cache/ps5/installed_pkgs.json (44 tokens verificados en hardware)

## 1. AUDITORÍA CRUEL PS5 — GROUND TRUTH FTP (11 JUEGOS VERIFICADOS)
- CUSA02299 (Spider-Man 2018): Base 40.44 GB + Update v1.19 60fps 15.71 GB + 4 DLCs ➔ 100% COMPLETO ✅
- CUSA43942 (MLB The Show 24): Base 48.33 GB + Update v1.21 33.92 GB ➔ 100% COMPLETO ✅
- CUSA13795 (CTR Nitro-Fueled): Base 12.59 GB + Update v1.21 7.94 GB + 3 DLCs (Deluxe/Preorder/Firehawk) ➔ 100% COMPLETO ✅
- CUSA11518 (Mortal Kombat 11 Ultimate): Base 36.99 GB + Update v1.30 All DLC Mod 32.38 GB ➔ 100% COMPLETO ✅
- CUSA28561 (Horizon Forbidden West): Base 71.27 GB + Update v1.18 2.44 GB + 2 DLCs ➔ 100% COMPLETO ✅
- CUSA07995 (A Way Out): Base 15.81 GB + Update v1.01 0.11 GB ➔ 100% COMPLETO ✅
- CUSA07408 (God of War 2018): Base v1.00 36.06 GB + 8 DLCs armaduras/escudos ➔ 100% JUGABLE ✅
- CUSA13323 (Ghost of Tsushima DC): Base 45.31 GB + DLC Iki Island ➔ 100% JUGABLE ✅
- CUSA16742 (It Takes Two): Base 34.33 GB v1.00 ➔ 100% JUGABLE ✅
- CUSA23384 (Haven): Base 4.31 GB v1.06 Couples update ➔ 100% COMPLETO ✅
- SLUG51851 (Carritos N64): Base 0.03 GB ➔ 100% COMPLETO ✅
- almacenamiento_ps5: ~370 GB ocupados | >470 GB libres (de 848 GB).

## 2. HALLAZGOS Y PURGAS DE ERRORES (LECCIONES DE GUERRA)
- GOW 2018 Update v1.35: error 0x80f00612 (keystone/passcode mismatch vs base instalada) ➔ descartado; base v1.00 + 8 DLCs 100% funcional.
- Ragnarök Base (89.5 GB) & HZD Base (37.8 GB): truncados por corte AkiraBox; looping 64KB range request + socket timeout 0x80b211c8 ➔ aislados en C:\Biblioteca_Juegos_PS\_quarantine.
- KP post-reinicio PS5: provocado por DLC unlocker GoT redundante en /user/addcont/CUSA13323 ➔ aislado en E:\staging\_quarantine_corrupt. Cola 100% limpia.
- kstuff 1.10 vs 1.11: kstuff <= 1.10 NO soporta FW 13.40 (solo hasta 12.70, daría pantalla negra / candados). kstuff 1.11 es SSOT inamovible.

## 3. PENDIENTE LOCAL EN PC (LISTO PARA INSTALAR EN 1 COMANDO)
- Bloodborne (CUSA03173) Completo:
  - Base: CUSA03173-Game-PRELUDE-[DLPSGAME.COM].pkg (31.4 GB) en E:\Biblioteca_Juegos_PS
  - Update 60fps: CUSA03173_v1.09_1080p_60fps-[DLPSGAME.COM].pkg (9.4 GB) en C:\Biblioteca_Juegos_PS
  - DLC The Old Hunters: CUSA03173-DLC-PS4-[DLPSGAME.COM].pkg (1.3 MB) en E:\Biblioteca_Juegos_PS
- comando_ejecutar: `npm run ps5:install-lan` (instala Base ➔ Update ➔ DLC en cascada automática).

## 4. PENDIENTE WAN (RE-DESCARGA INTERNET)
- Spider-Man Miles Morales (CUSA17722): Terminar Base Parte 1 y 2 (Update v1.14 de 15 GB ya listo en PC).
- God of War Ragnarök (CUSA34384): Re-descargar Base limpia de 90 GB (Update v6.05 de 24 GB ya listo en PC).
- Horizon Zero Dawn (CUSA01967): Re-descargar Base limpia de 40 GB (Update v1.54 y 10 DLCs ya listos en PC/PS5).
