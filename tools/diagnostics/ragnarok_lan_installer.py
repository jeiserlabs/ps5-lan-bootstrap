#!/usr/bin/env python3
"""
ragnarok_lan_installer.py - Orquestador LAN para God of War Ragnarök (CUSA34388)
Inyecta Base PKG (84.33 GiB / 90.55 GB) hacia PS5 (:12800) servido por server.js (:9898)
Monitorea progreso en vivo, velocidad MB/s y verifica consolidación final en /user/app/CUSA34388.
"""

import sys
import time
import json
import urllib.request
import urllib.parse
import ftplib

PC_IP = "192.168.2.1"
PC_PORT = 9898
PS5_IP = "192.168.2.2"
PS5_PORT = 12800
FTP_PORT = 2121

PKG_NAME = "EP9000-CUSA34388_00-GOWRAGNAROK00000-A0100-V0100-Base.pkg"
TITLE_ID = "CUSA34388"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def get_status():
    try:
        url = f"http://{PS5_IP}:{PS5_PORT}/api/status"
        with urllib.request.urlopen(url, timeout=3) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None

def get_space():
    try:
        url = f"http://{PS5_IP}:{PS5_PORT}/api/space"
        with urllib.request.urlopen(url, timeout=3) as r:
            data = json.loads(r.read().decode())
            return data.get("free", 0) / (1024**3)
    except Exception:
        return -1

def verify_ps5_installed():
    try:
        f = ftplib.FTP()
        f.connect(PS5_IP, FTP_PORT, timeout=5)
        f.login()
        lines = []
        f.retrlines(f"LIST /user/app/{TITLE_ID}", lines.append)
        f.quit()
        return [l for l in lines if "app.pkg" in l]
    except Exception as e:
        return []

def main():
    log("=== SPRINT INSTALACION GOW RAGNAROK (CUSA34388) ===")
    
    # 1. Verificar espacio en PS5
    free_gb = get_space()
    log(f"[*] Espacio libre en PS5: {free_gb:.2f} GB (Requerido: ~90.55 GB)")
    if free_gb < 90:
        log("[-] ERROR: Espacio insuficiente en PS5 para instalar Ragnarök.")
        sys.exit(1)

    # 2. Verificar estado del receiver
    st = get_status()
    if not st:
        log("[-] ERROR: pkg-receiver en PS5 (:12800) no responde.")
        sys.exit(1)
    if st.get("busy") or st.get("pull"):
        log("[-] ADVERTENCIA: pkg-receiver está ocupado actualmente. Esperando 5s...")
        time.sleep(5)

    # 3. Disparar orden de instalación
    pkg_url = f"http://{PC_IP}:{PC_PORT}/pkg/{urllib.parse.quote(PKG_NAME)}"
    install_url = f"http://{PS5_IP}:{PS5_PORT}/install?url={urllib.parse.quote(pkg_url)}&name={urllib.parse.quote(PKG_NAME)}"
    
    log(f"[*] Disparando instalación hacia PS5...")
    log(f"    URL: {pkg_url}")
    try:
        req = urllib.request.Request(install_url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            log(f"[+] Respuesta de PS5: {body.strip()}")
    except Exception as e:
        log(f"[-] ERROR enviando comando a PS5: {e}")
        sys.exit(1)

    # 4. Esperar inicio de pull
    log("[*] Esperando arranque de stream en PS5...")
    started = False
    for _ in range(40):
        time.sleep(1)
        st = get_status()
        if st and (st.get("busy") or st.get("pull") or st.get("active", 0) > 0 or st.get("pullGot", 0) > 0):
            started = True
            break

    if not started:
        log("[-] PS5 no inició descarga en 40s. Abortando.")
        sys.exit(1)

    log("[+] ¡Stream iniciado en PS5! Monitoreando progreso a 1Gbps LAN...")
    last_got = 0
    start_time = time.time()
    
    while True:
        time.sleep(4)
        st = get_status()
        if not st:
            continue

        pull_got = st.get("pullGot", 0)
        pull_want = st.get("pullWant", 1)
        pull_name = st.get("pullName", PKG_NAME)
        busy = st.get("busy", False)

        if pull_want > 1000:
            pct = (pull_got / pull_want) * 100
            got_gb = pull_got / (1024**3)
            want_gb = pull_want / (1024**3)
            delta = max(0, pull_got - last_got)
            speed_mbs = (delta / 4) / (1024**2)
            last_got = pull_got
            
            rem_bytes = max(0, pull_want - pull_got)
            eta_s = (rem_bytes / (delta / 4)) if delta > 0 else 0
            eta_m = eta_s / 60

            log(f"[Progreso] {got_gb:.2f} / {want_gb:.2f} GB ({pct:.1f}%) | {speed_mbs:.1f} MB/s | ETA: {eta_m:.1f}m")

            if pull_got >= pull_want:
                log(f"[+] Transferencia completada ({want_gb:.2f} GB). Esperando consolidación final...")
                while True:
                    time.sleep(4)
                    st2 = get_status()
                    if not st2:
                        continue
                    if not st2.get("busy") and not st2.get("pull"):
                        log("[+] pkg-receiver ha finalizado la consolidación.")
                        break
                break

    # 5. Verificación final FTP
    log("[*] Verificando instalación en /user/app/CUSA34388...")
    time.sleep(3)
    installed = verify_ps5_installed()
    if installed:
        log(f"[SUCCESS] ¡God of War Ragnarök BASE 100% INSTALADO en PS5!")
        for item in installed:
            log(f"    {item}")
    else:
        log("[-] No se detectó app.pkg en /user/app/CUSA34388 aún. Revisar notificaciones PS5.")

if __name__ == "__main__":
    main()
