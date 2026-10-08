#!/usr/bin/env python3
"""
full_auto_cleaner.py - Auditor y Limpiador Total Automático para PS5
Detecta en vivo cuando levanta el FTP (2121) y ejecuta la limpieza completa
de todas las zonas seguras del checklist.
"""

import ftplib
import socket
import time
import sys
import os
import urllib.request
import json

PS5_IP = "192.168.2.2"
FTP_PORT = 2121
LOG_FILE = r"E:\ps5\data\telemetry\deep_clean.log"
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)

def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

def get_space():
    try:
        url = f"http://{PS5_IP}:12800/api/space"
        req = urllib.request.Request(url, headers={"User-Agent": "AutoCleaner"})
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("free", 0) / (1024**3), data.get("total", 0) / (1024**3)
    except Exception:
        return None, None

def get_list(ftp, path):
    try:
        ftp.cwd(path)
        lines = []
        ftp.retrlines("LIST", lines.append)
        entries = []
        for l in lines:
            parts = l.split()
            if len(parts) >= 9:
                name = " ".join(parts[8:])
                if name not in (".", ".."):
                    is_dir = l.startswith("d")
                    size = int(parts[4]) if not is_dir else 0
                    entries.append({"name": name, "dir": is_dir, "size": size})
        return entries
    except Exception:
        return []

def purge_folder(ftp, path):
    entries = get_list(ftp, path)
    freed = 0
    for e in entries:
        sub = f"{path}/{e['name']}"
        if e['dir']:
            freed += purge_folder(ftp, sub)
        else:
            try:
                ftp.delete(e['name'])
                freed += e['size']
                log(f"  [-] Borrado: {sub} ({e['size'] / (1024*1024):.2f} MB)")
            except Exception as ex:
                log(f"  [!] Error borrando {sub}: {ex}")
    try:
        ftp.cwd("..")
        ftp.rmd(path)
        log(f"  [-] Carpeta eliminada: {path}")
    except Exception:
        pass
    return freed

def clean_all(ftp):
    total_freed = 0
    log("=== INICIANDO AUDITORÍA Y LIMPIEZA PROFUNDA ===")

    # 1. /user/download
    log("1. Auditando /user/download...")
    dl_entries = get_list(ftp, "/user/download")
    if not dl_entries:
        log("  -> /user/download ya está limpio.")
    else:
        for e in dl_entries:
            sub = f"/user/download/{e['name']}"
            log(f"  Detectado residuo en download: {sub}")
            if e['dir']:
                total_freed += purge_folder(ftp, sub)
            else:
                try:
                    ftp.delete(e['name'])
                    total_freed += e['size']
                    log(f"  [-] Borrado: {sub}")
                except Exception:
                    pass

    # 2. /user/bgft/task y /user/bgft/trash
    for bgft_path in ("/user/bgft/task", "/user/bgft/trash"):
        log(f"2. Auditando {bgft_path}...")
        b_entries = get_list(ftp, bgft_path)
        for e in b_entries:
            sub = f"{bgft_path}/{e['name']}"
            if not e['dir'] and (e['name'].endswith(".dat") or e['name'].endswith(".task")):
                try:
                    ftp.delete(e['name'])
                    total_freed += e['size']
                    log(f"  [-] Borrado archivo BGFT huérfano: {sub}")
                except Exception:
                    pass

    # 3. /user/temp y /tmp
    for tmp_path in ("/user/temp", "/tmp"):
        log(f"3. Auditando {tmp_path}...")
        t_entries = get_list(ftp, tmp_path)
        for e in t_entries:
            sub = f"{tmp_path}/{e['name']}"
            if not e['dir'] and (e['name'].startswith("core.") or e['name'].endswith(".dmp") or e['name'].endswith(".log") or e['name'] == "_temp.dat"):
                try:
                    ftp.delete(e['name'])
                    total_freed += e['size']
                    log(f"  [-] Borrado temporal: {sub}")
                except Exception:
                    pass

    # 4. /user/appmeta huérfanos vs /user/app
    log("4. Comparando /user/appmeta con /user/app...")
    installed_apps = set(e['name'] for e in get_list(ftp, "/user/app") if e['dir'])
    appmeta_entries = get_list(ftp, "/user/appmeta")
    for e in appmeta_entries:
        if e['dir'] and e['name'].startswith("CUSA") and e['name'] not in installed_apps:
            sub = f"/user/appmeta/{e['name']}"
            log(f"  Detectado metadato huérfano sin juego instalado: {sub}")
            total_freed += purge_folder(ftp, sub)

    # 5. /data/shadowmount, /data/ps5_autoloader, /data/logs
    for d_path in ("/data/shadowmount", "/data/ps5_autoloader", "/data/logs"):
        log(f"5. Auditando {d_path}...")
        d_entries = get_list(ftp, d_path)
        for e in d_entries:
            if not e['dir'] and (e['name'].endswith(".log") or e['name'].endswith(".old") or ".bak" in e['name']):
                sub = f"{d_path}/{e['name']}"
                try:
                    ftp.delete(e['name'])
                    total_freed += e['size']
                    log(f"  [-] Borrado log/backup antiguo: {sub}")
                except Exception:
                    pass

    # 6. Purgar residuos de etaHEN si reaparecieron
    for eta_path in ("/data/pldmgr/payloads/etaHEN", "/data/payloads/etaHEN"):
        if get_list(ftp, eta_path):
            total_freed += purge_folder(ftp, eta_path)

    log(f"=== LIMPIEZA COMPLETADA! Espacio total purgado: {total_freed / (1024**3):.2f} GB ===")

def main():
    log(f"=== VIGILANTE AUTOMÁTICO ACTIVO ({PS5_IP}:{FTP_PORT}) ===")
    log("Esperando a que el exploit levante en la PS5...")

    while True:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(0.8)
            if s.connect_ex((PS5_IP, FTP_PORT)) == 0:
                s.close()
                log("🟢 EXPLOIT Y FTP DETECTADOS! Iniciando limpieza inmediata...")
                break
            s.close()
        except Exception:
            pass
        time.sleep(0.8)

    free_pre, total = get_space()
    if free_pre:
        log(f"Espacio libre antes de iniciar: {free_pre:.2f} GB / {total:.2f} GB")

    ftp = ftplib.FTP()
    try:
        ftp.connect(PS5_IP, FTP_PORT, timeout=10)
        ftp.login()
        ftp.set_pasv(True)
        clean_all(ftp)
        ftp.quit()
    except Exception as e:
        log(f"Error durante proceso FTP: {e}")

    time.sleep(1)
    free_post, _ = get_space()
    if free_post:
        log(f"Espacio libre final en SSD: {free_post:.2f} GB (Ganancia: +{free_post - (free_pre or 0):.2f} GB)")

    log("=== SISTEMA TOTALMENTE PURGADO Y LIMPIO ===")

if __name__ == "__main__":
    main()
