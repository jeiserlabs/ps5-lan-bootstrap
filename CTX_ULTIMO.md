# CTX_ULTIMO — PS5 13.40 (CAVEMAN ULTRA)
ts: 2026-10-08T07:50:00-05:00
checkpoint_reason: Checkpoint explicito usuario + Auditoria forense completa

## ESTADO LIVE
* ps5: FW 13.40 Slim Disc · IP 192.168.2.2 · Enlace LAN 1Gbps directo (ping 0ms)
* uptime: >14m continuo verificado por monitor telemetrico (Crash 3m resuelto)
* ports: 2121 (FTP=OK), 12800 (pkg-receiver=OK, busy:false), 8084 (pldmgr=OK)
* ssd_free: 348.26 GB
* juegos_activos: 11 en /user/app (todos funcionales via menu oficial)

## TIMELINE COMPLETO DE INCIDENTE & INTENTOS
1. APAGONES SISTEMATICOS:
   - Consola sufria corte de energia/kernel panic cada 180-200s (3 min).
2. DESCARTE DE HIPOTESIS FALLIDAS:
   - H1 (etaHEN corrupto): Se borro carpeta /data/pldmgr/payloads/etaHEN/ -> seguia apagandose.
   - H2 (kstuff vs kstuff-lite): Binarios en 13.40 tienen mismo SHA256 (EchoStretch 1.11). No existe "kstuff normal" para 13.40.
   - H3 (SMP auto-toggle): /data/shadowmount/config.ini verificado -> kstuff_game_auto_toggle=0 ya estaba puesto desde 3-oct.
   - H4 (Hardware M.2): PC NVMe Gen3 incompatible con POST de PS5; PC NVMe Gen4 es C: de Windows. Sin necesidad de swap fisico.
   - H5 (Factory reset): Descartado. Hubiera borrado 11 juegos y partidas innecesariamente.
3. IDENTIFICACION CAUSA RAIZ:
   - Auditoria FTP revelo 20.8 GB en /user/download (CUSA43942 con 18.5 GB en chunks .dat + NPXS40140 con 2.4 GB).
   - Daemon BGFT del kernel Sony intentaba reanudar descarga fallida sin host -> timeout watchdog apaga PMIC a los 3 min.
4. RESOLUCION FORENSE:
   - Purga automatica FTP de /user/download/ y residuos etaHEN.
   - Ganancia: +22.75 GB netos (de 325.50 GB a 348.26 GB).
   - Verificacion: Uptime >14m sin caidas. Consola 100% estable.

## PROXIMO PASO
* Instalar God of War 2018 (CUSA07408):
  - Base: 36.06 GB (e:\ps5 o Desktop)
  - Patch 1.35: 7.42 GB
  - Via gow_lan_installer.py (Range 206 @ 100 MB/s) hacia puerto 12800.
