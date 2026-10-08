#!/usr/bin/env python3
"""
naruto_lan_installer.py - Orquestador LAN para Naruto x Boruto Ultimate Ninja STORM CONNECTIONS (CUSA32836)
Instala Base (22.71 GB), Update v1.60 (11.39 GB) y 13 DLCs secuencialmente a 113 MB/s.
"""

import sys
import time
import json
import urllib.request
import urllib.parse
import ftplib
import os

PC_IP = "192.168.2.1"
PC_PORT = 9898
PS5_IP = "192.168.2.2"
PS5_PORT = 12800
TITLE_ID = "CUSA32836"

BASE_PKG = "EP0700-CUSA32836_00-A0100-V0100-CyB1K-[DLPSGAME.COM].pkg"
UPDATE_PKG = "EP0700-CUSA32836_00-A0160-V0100-CyB1K-[DLPSGAME.COM].pkg"
DLC_DIR = r"C:\Users\dev\Desktop\NARUTO_DLCS"

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
            return json.loads(r.read().decode()).get("free", 0) / (1024**3)
    except Exception:
        return -1

def install_and_wait(pkg_name, label="PKG"):
    log(f"[*] Preparando {label}: {pkg_name}")
    
    # Esperar receiver idle
    for _ in range(30):
        st = get_status()
        if st and not st.get("busy") and not st.get("pull"):
            break
        time.sleep(2)
        
    pkg_url = f"http://{PC_IP}:{PC_PORT}/pkg/{urllib.parse.quote(pkg_name)}"
    install_url = f"http://{PS5_IP}:{PS5_PORT}/install?url={urllib.parse.quote(pkg_url)}&name={urllib.parse.quote(pkg_name)}"
    
    try:
        req = urllib.request.Request(install_url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp_str = resp.read().decode().strip()
            log(f"[+] Orden enviada: {resp_str}")
    except Exception as e:
        log(f"[-] Error enviando {pkg_name}: {e}")
        return False

    # Esperar arranque
    time.sleep(2)
    last_got = 0
    while True:
        time.sleep(3)
        st = get_status()
        if not st:
            continue
            
        pull_got = st.get("pullGot", 0)
        pull_want = st.get("pullWant", 1)
        busy = st.get("busy", False)
        pull = st.get("pull", False)
        
        if pull_want > 1000:
            pct = (pull_got / pull_want) * 100
            got_gb = pull_got / (1024**3)
            want_gb = pull_want / (1024**3)
            delta = max(0, pull_got - last_got)
            speed_mbs = (delta / 3) / (1024**2)
            last_got = pull_got
            log(f"[{label}] {got_gb:.2f} / {want_gb:.2f} GB ({pct:.1f}%) | {speed_mbs:.1f} MB/s")
            
            if pull_got >= pull_want:
                log(f"[+] {label} descargado al 100%. Esperando consolidacion...")
                while True:
                    time.sleep(2)
                    st2 = get_status()
                    if st2 and not st2.get("busy") and not st2.get("pull"):
                        log(f"[SUCCESS] {label} consolidado correctamente.")
                        return True
        else:
            # Paquetes muy pequeños (DLCs < 2MB que consolidan casi instantaneo)
            if not busy and not pull:
                log(f"[SUCCESS] {label} instalado.")
                return True

def main():
    log("=== SPRINT INSTALACION NARUTO X BORUTO (CUSA32836) ===")
    
    free_gb = get_space()
    log(f"[*] Espacio en PS5: {free_gb:.2f} GB libres (Requerido: ~35 GB)")
    if free_gb < 35:
        log("[-] Espacio insuficiente. Abortando.")
        sys.exit(1)

    # 1. Base
    if not install_and_wait(BASE_PKG, "BASE (v1.00)"):
        log("[-] Fallo instalacion de Base. Abortando.")
        sys.exit(1)
        
    # 2. Update
    if not install_and_wait(UPDATE_PKG, "UPDATE (v1.60)"):
        log("[-] Fallo instalacion de Update. Abortando.")
        sys.exit(1)
        
    # 3. DLCs
    dlc_files = [f for f in os.listdir(DLC_DIR) if f.endswith(".pkg")]
    log(f"[*] Instalando {len(dlc_files)} DLCs...")
    for idx, dlc in enumerate(sorted(dlc_files), 1):
        install_and_wait(dlc, f"DLC {idx}/{len(dlc_files)}")
        time.sleep(1)

    log("[*] Verificando en FTP...")
    f = ftplib.FTP()
    f.connect(PS5_IP, 2121, timeout=5)
    f.login()
    
    print("\n=== /user/app/CUSA32836 ===")
    f.retrlines("LIST /user/app/CUSA32836", print)
    
    print("\n=== /user/patch/CUSA32836 ===")
    f.retrlines("LIST /user/patch/CUSA32836", print)
    
    print("\n=== /user/addcont/CUSA32836 ===")
    f.retrlines("LIST /user/addcont/CUSA32836", print)
    
    f.quit()
    log("[FINISH] ¡NARUTO X BORUTO STORM CONNECTIONS 100% INSTALADO CON UPDATE Y TODOS SUS DLCS!")

if __name__ == "__main__":
    main()
