# ESTADO_VIVO — PIPELINE PS5 AUTONOMO (CAVEMAN ULTRA)
ts: 2026-10-06T21:28:00-05:00
host: PC Jeiser (Windows 11 AMD64)
red_pc: Tether USB S23 Ultra (16 conexiones IDM) · 100% estable
lan_ps5: Ethernet directa 192.168.2.1 <-> 192.168.2.2 (1 Gbps OK)
ps5_fw: 13.40 Slim · Autoloader 0.5.2 · kstuff 1.11 · pkg-receiver 12800 · ftpsrv 2121
ssot: data/cache/ps5/installed_pkgs.json (38 verificados FTP)
daemons: server 9898 + kstuff_watchdog + daemon VIVOS

## 1. REGLA DE ESPACIO SSD PS5 (226 GB LIBRES)
* Plan acordado e implementado en pipeline:
  1. Horizon Zero Dawn Complete Edition EUR (CUSA10213, ~43.6G) ➔ AUTO-INSTALAR.
  2. God of War Ragnarök EUR (CUSA34386, ~116.7G) ➔ AUTO-INSTALAR.
  3. EA SPORTS FC 27 (CUSA57220, ~62.0G) ➔ AUTO-INSTALAR.
  * Total a instalar en PS5: ~222.3 GB (cabe justo en los 226 GB libres).
* Naruto Connections (CUSA32836, ~37.2G):
  * REGLA ACTIVA: Retenido en PC (bloqueado en pkg_rules.js para NO enviar a PS5).
  * Quedará íntegro en disco PC esperando que usuario libere espacio en consola.

## 2. CONSOLA PS5 (100% LIMPIA, CERO HUERFANOS)
* Bases reales: 11 juegos + Carritos N64.
* Updates: 6 (100% vinculados). DLCs: 18 (100% vinculados).
* Huérfanos: 0. Residuos /user/download: 0.

## 3. BIBLIOTECA PC
* E:\Biblioteca_Juegos_PS: HZD Update 1.54 (312.8M) esperando Base.
* GOW Ragnarök purgado 100% de PC para instalar release castellano desde cero.
