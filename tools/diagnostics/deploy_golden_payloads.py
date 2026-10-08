#!/usr/bin/env python3
"""
deploy_golden_payloads.py - Despliegue de etaHEN (11.00 - 13.60) + pkg-receiver + ftpsrv:
1. Centinela en espera de conexión (:8084 o :2121).
2. Sube etaHEN.elf (36.7 MB), pkg-receiver.elf y ftpsrv-ps5.elf a memoria interna.
3. Configura AUTOLOAD con etaHEN como HEN principal.
4. Inyecta etaHEN.elf en caliente.
5. Sincroniza /data/pldmgr/autoload.txt vía FTP.
"""

import os
import time
import socket
import json
import urllib.request
import urllib.error
import io
from ftplib import FTP

PS5_IP = "192.168.2.2"
LOCAL_ETAHEN = r"E:\ps5\payloads\etaHEN-11.00-13.60.elf"
PAYLOADS_DIR = r"E:\ps5\data\backups\console_state\2026-10-08T00-20-56\payloads_console"

PAYLOADS_LIST = [
    ("etaHEN.elf", LOCAL_ETAHEN, "etaHEN v2.5b (11.00-13.60)", ["/data/pldmgr/payloads/etahen", "/data/pldmgr/payloads/etaHEN"]),
    ("pkg-receiver.elf", os.path.join(PAYLOADS_DIR, "pkg-receiver.elf"), "PKG-Receiver :12800", ["/data/pldmgr/payloads/pkg-receiver"]),
    ("ftpsrv-ps5.elf", os.path.join(PAYLOADS_DIR, "ftpsrv-ps5.elf"), "FTP Server :2121", ["/data/pldmgr/payloads/ftpsrv"])
]

AUTOLOAD_CHAIN = "!8000,etaHEN.elf,!5000,pkg-receiver.elf,!5000,ftpsrv-ps5.elf"
AUTOLOAD_TXT = b"!8000\netaHEN.elf\n!5000\npkg-receiver.elf\n!5000\nftpsrv-ps5.elf\n"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_for_connection(timeout=3600):
    log(f"Centinela etaHEN activo: esperando PS5 ({PS5_IP}:8084 o :2121)...")
    start = time.time()
    last_log = 0
    while time.time() - start < timeout:
        for port in [8084, 2121]:
            try:
                s = socket.socket()
                s.settimeout(0.4)
                if s.connect_ex((PS5_IP, port)) == 0:
                    s.close()
                    log(f"[+] ¡PS5 DETECTADA ONLINE EN PUERTO {port}!")
                    return port
                s.close()
            except Exception:
                pass
        if time.time() - last_log > 300:
            log(f"[*] A la escucha en {PS5_IP}... (enciende consola y entra a Guía de Usuario)")
            last_log = time.time()
        time.sleep(1)
    log("[-] Tiempo de espera agotado.")
    return None

def upload_via_http():
    log("=== 1. SUBIENDO etaHEN Y PAYLOADS VIA HTTP (:8084 /manage:upload) ===")
    for fname, local_path, desc, _ in PAYLOADS_LIST:
        if not os.path.exists(local_path):
            log(f"[-] Archivo local no encontrado: {local_path}")
            continue

        size = os.path.getsize(local_path)
        url = f"http://{PS5_IP}:8084/manage:upload?filename={fname}"
        log(f"[*] Subiendo {fname} ({size} bytes - {desc})...")
        try:
            with open(local_path, "rb") as f:
                data = f.read()
            req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/octet-stream"})
            with urllib.request.urlopen(req, timeout=30) as r:
                log(f"    [+] {fname} guardado en memoria interna: {r.read().decode().strip()}")
        except Exception as e:
            log(f"    [-] HTTP upload de {fname}: {e}")

def configure_autoload_http():
    log("=== 2. FIJANDO CADENA AUTOLOAD CON etaHEN EN :8084 ===")
    url = f"http://{PS5_IP}:8084/set_config"
    cfg = {
        "AUTOLOAD_ENABLED": True,
        "AUTOLOAD_LIST": AUTOLOAD_CHAIN,
        "AUTOLOAD_DELAY": 5,
        "AUTO_BROWSER_OPEN": False,
        "KILL_DISC_PLAYER_ON_STARTUP": True,
        "SCAN_USB_PAYLOADS": False,
        "AUTO_INSTALL_APP": True
    }
    try:
        req = urllib.request.Request(url, data=json.dumps(cfg).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as r:
            log(f"[+] Autoload configurado en :8084: {r.read().decode().strip()}")
            log(f"    Cadena etaHEN: {AUTOLOAD_CHAIN}")
    except Exception as e:
        log(f"[-] Error en set_config :8084: {e}")

    try:
        load_url = f"http://{PS5_IP}:8084/loadpayload:etaHEN.elf"
        with urllib.request.urlopen(load_url, timeout=10) as r:
            log(f"[+] etaHEN.elf inyectado en caliente: {r.read().decode().strip()}")
    except Exception as e:
        log(f"[*] Nota al inyectar etaHEN en caliente: {e}")

def sync_via_ftp():
    log("=== 3. SINCRONIZANDO etaHEN Y autoload.txt EN DISCO VIA FTP ===")
    try:
        ftp = FTP()
        ftp.connect(PS5_IP, 2121, timeout=5)
        ftp.login()
        for base in ["/data/pldmgr", "/data/pldmgr/payloads"]:
            try: ftp.mkd(base)
            except Exception: pass

        for fname, local_path, desc, remote_folders in PAYLOADS_LIST:
            if not os.path.exists(local_path):
                continue
            for r_folder in remote_folders:
                try: ftp.mkd(r_folder)
                except Exception: pass
                with open(local_path, "rb") as f:
                    ftp.storbinary(f"STOR {r_folder}/{fname}", f)
                log(f"[+] FTP: {fname} guardado en {r_folder}/{fname}")

        ftp.cwd("/data/pldmgr")
        ftp.storbinary("STOR autoload.txt", io.BytesIO(AUTOLOAD_TXT))
        log("[+] FTP: /data/pldmgr/autoload.txt actualizado con etaHEN.")
        ftp.quit()
        return True
    except Exception as e:
        log(f"[*] FTP sinc: {e}")
        return False

def verify_services():
    log("=== 4. VERIFICANDO SERVICIOS ===")
    for port, name in [(8084, "Autoloader"), (12800, "PKG-Receiver"), (2121, "FTP Server")]:
        try:
            s = socket.socket()
            s.settimeout(1.0)
            status = "ONLINE" if s.connect_ex((PS5_IP, port)) == 0 else "OFFLINE"
            s.close()
            log(f"    Puerto {port} ({name}): {status}")
        except Exception:
            log(f"    Puerto {port} ({name}): OFFLINE")

def main():
    log("==========================================================")
    log(" DESPLIEGUE AUTOMÁTICO DE etaHEN A LA MEMORIA INTERNA")
    log("==========================================================")
    active_port = wait_for_connection()
    if not active_port:
        return
    time.sleep(1)
    upload_via_http()
    time.sleep(0.5)
    configure_autoload_http()
    time.sleep(0.5)
    sync_via_ftp()
    time.sleep(1)
    verify_services()
    log("==========================================================")
    log(" [LISTO] etaHEN Y SERVICIOS DESPLEGADOS EN LA PS5")
    log("==========================================================")

if __name__ == "__main__":
    main()
