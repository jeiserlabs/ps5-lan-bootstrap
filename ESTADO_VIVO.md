# ESTADO_VIVO — PS5 13.40 (CAVEMAN ULTRA)
ts: 2026-10-08T10:25:00-05:00
host: PC Jeiser (192.168.2.1) <-> PS5 (192.168.2.2 direct LAN 1Gbps)
fw: 13.40 Slim Disc · Exploit: WebKit + Relapse
status: ESTABLE · UPTIME >125m · 13 JUEGOS 100% COMPLETOS (NARUTO CONNECTIONS FULL)

## 1. ESTADO RED Y SERVICIOS LIVE
* pc_ip: 192.168.2.1 (Intel I211 direct LAN)
* ps5_ip: 192.168.2.2 (ping 0ms)
* server_lan: node pipeline/scripts/server.js (:9898)
* ports_open:
  - 2121: ftpsrv (OPEN)
  - 12800: pkg-receiver Loopayeh (OPEN, idle)
  - 8084: pldmgr (OPEN)
  - 9898: PC Multi-Drive Server (OPEN)

## 2. JUEGOS Y ALMACENAMIENTO (100% AUDITADO)
* total_instalados: 13 juegos (bases ~510 GB, updates ~110 GB, 32 DLCs)
* naruto_connections (CUSA32836): Base 22.71 GB + Upd 1.60 (11.39 GB) + 12 DLCs (13 packs) -> 100% FULL
* god_of_war_ragnarok (CUSA34388): Base 90.55 GB + Upd 2.00 (19.56 GB) + 2 DLCs (Deluxe/Preorder) -> 100% FULL
* god_of_war_2018 (CUSA07408): Base 38.72 GB + Upd 1.34 (7.73 GB) + 8 DLCs -> 100% FULL
* ghost_of_tsushima (CUSA13323): Base 48.65 GB (v2.24) + DLC Director's Cut -> 100% FULL
* haven (CUSA23384): Base 4.62 GB (v1.06 integrado) -> 100% FULL
* otros_8_juegos: Spiderman (Base+Upd+4DLC), Miles Morales (Base+Upd), Horizon FW (Base+Upd+2DLC), Horizon ZD (Base+Upd), CTR (Base+Upd+3DLC), It Takes Two (Base v1.03), A Way Out (Base+Upd), MLB 24 (Base+Upd) -> 100% FULL
* ps5_storage: 132.14 GB libres en SSD interno (verificado via :12800 /api/space)
* ps5_junk: /user/download limpio (0 bytes) · /user/bgft/trash limpio (0 bytes)

## 3. ARQUITECTURA DORADA Y ESTABILIDAD
* uptime_verificado: >125m ininterrumpido sin un solo kernel panic.
* cadena_dorada: kstuff-lite_v1.11.elf -> pkg-receiver.elf -> ftpsrv_v0.21.1.elf
* pc_cleanup: C: Desktop 100% purgado (0 PKG, 0 RAR, 0 ZIP, Telegram dir limpio).
