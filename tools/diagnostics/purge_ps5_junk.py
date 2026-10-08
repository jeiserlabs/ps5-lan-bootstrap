#!/usr/bin/env python3
"""
purge_ps5_junk.py - Purga Quirúrgica de Basura y Archivos Fantasma en PS5
1. Elimina 20.8 GB de descargas corruptas en /user/download/
2. Elimina residuos de etaHEN en /data/pldmgr/payloads/etaHEN/
3. Consulta espacio libre en SSD vía API /api/space
"""

import ftplib
import json
import urllib.request
import time
import sys

PS5_IP = "192.168.2.2"
FTP_PORT = 2121

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def get_space():
    try:
        url = f"http://{PS5_IP}:12800/api/space"
        req = urllib.request.Request(url, headers={"User-Agent": "PurgeTool"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            free_gb = data.get("free", 0) / (1024**3)
            total_gb = data.get("total", 0) / (1024**3)
            return free_gb, total_gb
    except Exception as e:
        return None, None

def rmdir_recursive(ftp, path):
    try:
        ftp.cwd(path)
    except Exception as e:
        log(f"No se puede acceder a {path}: {e}")
        return 0

    deleted_bytes = 0
    items = []
    ftp.retrlines("LIST", items.append)

    for item in items:
        parts = item.split()
        if len(parts) < 9:
            continue
        name = " ".join(parts[8:])
        if name in (".", ".."):
            continue
        full_sub = f"{path}/{name}"
        if item.startswith("d"):
            deleted_bytes += rmdir_recursive(ftp, full_sub)
        else:
            try:
                size = int(parts[4])
            except Exception:
                size = 0
            try:
                ftp.delete(name)
                deleted_bytes += size
                log(f"  [-] Borrado: {full_sub} ({size / (1024**2):.2f} MB)")
            except Exception as e:
                log(f"  [!] Fallo al borrar {full_sub}: {e}")

    try:
        ftp.cwd("..")
        ftp.rmd(path)
        log(f"  [-] Carpeta eliminada: {path}")
    except Exception as e:
        log(f"  [!] Fallo al eliminar carpeta {path}: {e}")

    return deleted_bytes

def main():
    log("=== INICIANDO PURGA QUIRÚRGICA EN PS5 ===")
    free_before, total = get_space()
    if free_before:
        log(f"Espacio libre ANTES de purga: {free_before:.2f} GB / {total:.2f} GB")

    ftp = ftplib.FTP()
    ftp.connect(PS5_IP, FTP_PORT, timeout=10)
    ftp.login()
    ftp.set_pasv(True)
    log("Conexión FTP establecida.")

    total_purged = 0

    # 1. Purgar /user/download/CUSA43942
    log("Purgando /user/download/CUSA43942 (18.5 GB temporales)...")
    total_purged += rmdir_recursive(ftp, "/user/download/CUSA43942")

    # 2. Purgar /user/download/NPXS40140
    log("Purgando /user/download/NPXS40140 (2.4 GB temporales)...")
    total_purged += rmdir_recursive(ftp, "/user/download/NPXS40140")

    # 3. Purgar /data/pldmgr/payloads/etaHEN
    log("Purgando residuos de etaHEN en /data/pldmgr/payloads/etaHEN...")
    total_purged += rmdir_recursive(ftp, "/data/pldmgr/payloads/etaHEN")

    ftp.quit()
    log(f"Purga FTP completada. Total bytes liberados: {total_purged / (1024**3):.2f} GB")

    time.sleep(1)
    free_after, _ = get_space()
    if free_after:
        log(f"Espacio libre DESPUÉS de purga: {free_after:.2f} GB (Ganancia: +{free_after - (free_before or 0):.2f} GB)")

    log("=== PURGA FINALIZADA CON ÉXITO ===")

if __name__ == "__main__":
    main()
