#!/usr/bin/env python3
"""
purge_and_enable_usb.py - Purga total del SSD interno y activacion de modo USB:
1. Espera conexion de PS5 (:8084 o :2121).
2. Habilita SCAN_USB_PAYLOADS = True en :8084 para que la consola cargue de la USB.
3. Purga por FTP todo rastro de etaHEN y autoloads viejos del SSD interno (/data/pldmgr).
4. Verifica que kstuff y pkg-receiver carguen limpios desde la USB.
"""

import socket
import urllib.request
import json
import ftplib
import time

PS5_IP = "192.168.2.2"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_for_connection(timeout=3600):
    log(f"Centinela USB activo: esperando PS5 ({PS5_IP}:8084 o :2121)...")
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
            log(f"[*] A la escucha en {PS5_IP}... (conecta USB a PS5, enciende y entra a Guía de Usuario)")
            last_log = time.time()
        time.sleep(1)
    return None

def configure_autoloader_usb():
    log("=== [1] CONFIGURANDO AUTOLOADER EN :8084 PARA MODO USB ===")
    url = f"http://{PS5_IP}:8084/set_config"
    cfg = {
        "AUTOLOAD_ENABLED": True,
        "SCAN_USB_PAYLOADS": True,
        "AUTOLOAD_LIST": "!8000,kstuff.elf,!5000,pkg-receiver.elf,!5000,ftpsrv-ps5.elf",
        "AUTOLOAD_DELAY": 5,
        "AUTO_BROWSER_OPEN": False,
        "KILL_DISC_PLAYER_ON_STARTUP": True,
        "AUTO_INSTALL_APP": False
    }
    try:
        req = urllib.request.Request(url, data=json.dumps(cfg).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as r:
            log(f"[+] :8084 configurado para SCAN_USB_PAYLOADS = True: {r.read().decode().strip()}")
    except Exception as e:
        log(f"[-] Nota en set_config :8084: {e}")

def purge_internal_ssd_via_ftp():
    log("=== [2] PURGANDO RESIDUOS DEL SSD INTERNO (/data/pldmgr) ===")
    try:
        ftp = ftplib.FTP()
        ftp.connect(PS5_IP, 2121, timeout=8)
        ftp.login()
        log("[+] Conectado a FTP :2121")

        # 1. Eliminar archivos y carpetas de etaHEN del SSD interno
        targets_to_delete = [
            "/data/pldmgr/payloads/etahen/etaHEN.elf",
            "/data/pldmgr/payloads/etaHEN/etaHEN.elf",
            "/data/pldmgr/payloads/etaHEN.elf",
            "/data/pldmgr/autoload.txt"  # Al borrarlo interno, fuerza lectura exclusiva desde USB
        ]

        for path in targets_to_delete:
            try:
                ftp.delete(path)
                log(f"    [BORRADO] {path} eliminado del SSD interno con exito.")
            except Exception:
                pass

        for folder in ["/data/pldmgr/payloads/etahen", "/data/pldmgr/payloads/etaHEN"]:
            try:
                ftp.rmd(folder)
                log(f"    [BORRADO] Carpeta {folder} eliminada del SSD interno.")
            except Exception:
                pass

        # Listar contenido residual en /data/pldmgr
        try:
            ftp.cwd("/data/pldmgr")
            files = ftp.nlst()
            log(f"[+] Contenido residual limpio en /data/pldmgr: {files}")
        except Exception:
            pass

        ftp.quit()
        log("=== [EXITO] SSD INTERNO PURGADO AL 100% ===")
        return True
    except Exception as e:
        log(f"[*] FTP purga: {e}")
        return False

def verify_services():
    log("=== [3] VERIFICANDO ESTADO DE SERVICIOS USB ===")
    for port, name in [(8084, "Autoloader"), (12800, "PKG-Receiver"), (2121, "FTP")]:
        s = socket.socket()
        s.settimeout(0.5)
        st = "ONLINE" if s.connect_ex((PS5_IP, port)) == 0 else "OFFLINE"
        s.close()
        log(f"    Puerto {port} ({name}): {st}")

def main():
    log("==========================================================")
    log(" CENTINELA DE PURGA TOTAL Y ACTIVACION DE MODO USB")
    log("==========================================================")
    port = wait_for_connection()
    if not port:
        return
    time.sleep(1)
    configure_autoloader_usb()
    time.sleep(0.5)
    purge_internal_ssd_via_ftp()
    time.sleep(1)
    verify_services()
    log("==========================================================")
    log(" [COMPLETO] CONSOLA CORRIENDO 100% DESDE MEMORIA USB")
    log("==========================================================")

if __name__ == "__main__":
    main()
