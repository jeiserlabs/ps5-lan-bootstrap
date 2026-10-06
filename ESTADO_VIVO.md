# ESTADO_VIVO — PIPELINE PS5 AUTONOMO
ts: 2026-10-06T08:12:00-05:00
host: PC Jeiser (Windows 11 AMD64)
red_pc: Casa WiFi TP-Link USB (192.168.1.64, 1.6 MB/s) · tether USB DESENCHUFADO
lan_ps5: Ethernet directa 192.168.2.1 <-> 192.168.2.2 (1 Gbps OK)
ps5_fw: 13.40 Slim · WebKit Autoloader 0.5.2 (:8084 OK) · pkg-receiver (:12800 OK) · ftpsrv (:2121 OK) · elfldr (:9021 cerrado)
ssot: data/cache/ps5/queue_state.json (22) + installed_pkgs.json (37 reales)

## 1. CONSOLA (Auditada cruelmente via FTP 2121)
Juegos Base (9 reales + stubs/sys): Spider-Man (40.44G) · GOW 2018 (36.06G) · A Way Out (15.81G) · Tsushima DC (45.31G) · CTR (12.59G) · It Takes Two (34.33G) · Haven (4.31G) · HFW (71.27G) · MLB 24 (48.33G).
Updates (5): Spider-Man (15.71G) · A Way Out (0.11G) · CTR (7.94G) · HFW (2.44G) · MLB 24 (33.92G).
DLCs (19 vinculados + 1 huerfano): CUSA00900_SPEXPANSIONDLC03 huerfano (BB USA sin base).
Almacenamiento PS5: 368.57 GB ocupados en /user -> ~479 GB libres en SSD Slim (~848 GB utilizables). NO falta espacio.

## 2. INCIDENCIA RESUELTA: CAUSA RAIZ 500 EN SERVER LAN (BB BASE)
server.js previo (PID 11256 de ayer) tenia bug de llave/scope en if(!resolved).
Al pedir cualquier PKG existente devolvia HTTP 500 Internal Server Error (arranque fallido BB).
Solucionado: server.js corregido, require guard (`require.main === module`), reiniciado (PID 1224).
Verificado: HEAD curl responde HTTP 200 OK exacto en Base BB (31.35 GB) y Update (181 MB).
daemon.js refactorizado (257L < 300L SRP): ya NO registra installed prematuro; delega a lan_installer con verificacion FTP real.

## 3. BIBLIOTECA PC & HALLAZGOS COMPATIBILIDAD
Bloodborne Base: CUSA03173-Game-PRELUDE (29.20 GiB / 31.35 GB) validado 8/8 OK.
Bloodborne Update: CUSA03173 v1.09 60fps (181 MB) validado OK.
Bloodborne DLC: CUSA03173-DLC...pkg en disco tiene SFO = CUSA00900 (USA, incompatible con Base EUR CUSA03173).
GoW Ragnarok DLCs EUR (CUSA34386 Deluxe + Preorder) OK retenidos esperando base.

## 4. DESCARGAS ACTIVAS (IDM)
10 items en IDM (18.55 GB bajados en chunks):
- Miles Morales EUR CUSA17776 (parts 1, 2, 3 + update/dlc)
- GT7 EUR Base CUSA10213
- GoW Ragnarok EUR CUSA34386 (Base + Upd 6.05 + Valhalla)
- MK11 LAT Base (MOD v1.30 sentenciado: no instalar)
Telegram: usuario envio links frescos akirabox de GT7 Base + Update 1.54.

## 5. SIGUIENTES ACCIONES
1. Instalar Bloodborne Base EUR (31.35 GB) via LAN a PS5 con server.js ya reparado.
2. Tras Base OK: instalar Update v1.09 60fps (181 MB).
3. Conseguir DLC The Old Hunters EUR (CUSA03173) para reemplazar DLC huerfano USA (CUSA00900).
4. Esperar finalizacion descargas IDM (Miles Morales / Ragnarok / GT7).
