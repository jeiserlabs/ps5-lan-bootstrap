# ESTADO_VIVO — PS5 13.40 (CAVEMAN ULTRA)
ts: 2026-10-08T08:10:00-05:00
host: PC Jeiser (192.168.2.1) <-> PS5 (192.168.2.2 direct LAN 1Gbps)
fw: 13.40 Slim Disc · Exploit: WebKit + Relapse
status: ESTABLE · UPTIME >35m · TRANSFERENCIA EN VIVO (Crash 3m ELIMINADO)

## 1. ESTADO RED Y TRANSFERENCIA LIVE
* pc_ip: 192.168.2.1 (Intel I211 direct LAN)
* ps5_ip: 192.168.2.2 (ping 0ms)
* server_lan: node pipeline/scripts/server.js (:9898)
* pkg_actual: God.of.War.2018-CUSA07408.pkg (Base 36.06 GB / 38.72 GB brutos)
* progreso_transferencia: >19 GB / 38.72 GB (>49% completado)
* velocidad_lan: 68 - 72 MB/s constantes (Range 206 chunks 16.8 MB)
* siguiente_cola: GOW_v1.35.PATCH.2018-CUSA07408-.pkg (7.42 GB)
* ports_open:
  - 2121: ftpsrv (OPEN)
  - 12800: pkg-receiver Loopayeh (OPEN, recibiendo stream)
  - 8084: pldmgr (OPEN)
  - 9898: PC Multi-Drive Server (OPEN, sirviendo stream)

## 2. AUDITORIA FORENSE Y CONSENSO ALCANZADO
* causa_apagones_confirmada:
  1. Doble hook de kernel: kstuff-lite + etaHEN en paralelo colapsaban memoria FreeBSD (vm_map) a los 3 min.
  2. Basura en disco: 20.8 GB corruptos en /user/download colgaban demonio nativo BGFT al reanudar en loop.
* solucion_aplicada_y_validada:
  - Eliminado etaHEN de autoload y payloads.
  - Purgado /user/download y /data/pldmgr/payloads/etaHEN/.
  - Ganancia neta: +22.75 GB (348.26 GB libres en SSD).
* cadena_dorada_probada:
  - kstuff-lite_v1.11.elf -> !5000 -> pkg-receiver.elf -> !5000 -> ftpsrv_v0.21.1.elf
  - shadowmount: config.ini tiene kstuff_game_auto_toggle=0 (sin pausas involuntarias).
* estabilidad: >35m continuo sin cuelgues ni panics (punto de restauracion solido).
