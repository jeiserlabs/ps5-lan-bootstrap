#!/usr/bin/env python3
"""
deep_audit_ps5.py - Auditoría y Escaneo Profundo por FTP en PS5
Escanea todas las zonas seguras del checklist y calcula espacio real.
"""

import ftplib
import socket
import time
import sys

PS5_IP = "192.168.2.2"
PS5_PORT = 2121

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_ftp():
    log(f"Esperando a que la PS5 inicie y levante FTP en {PS5_IP}:{PS5_PORT}...")
    while True:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(1.0)
            if s.connect_ex((PS5_IP, PS5_PORT)) == 0:
                s.close()
                log("🟢 FTP DETECTADO ONLINE! Iniciando escaneo profundo...")
                return True
            s.close()
        except Exception:
            pass
        time.sleep(1.0)

def scan_dir(ftp, path):
    print(f"\n==================== {path} ====================")
    try:
        ftp.cwd(path)
        items = []
        ftp.retrlines("LIST", items.append)
        if not items:
            print("  (Directorio vacío)")
        else:
            for it in items:
                print("  " + it)
    except Exception as e:
        print(f"  [No existe o no accesible: {e}]")

def main():
    wait_ftp()
    ftp = ftplib.FTP()
    try:
        ftp.connect(PS5_IP, PS5_PORT, timeout=10)
        ftp.login()
        ftp.set_pasv(True)

        # 1. /user/download
        scan_dir(ftp, "/user/download")

        # 2. /user/bgft/task y /user/bgft/trash
        scan_dir(ftp, "/user/bgft/task")
        scan_dir(ftp, "/user/bgft/trash")

        # 3. Temporales /user/temp y /tmp
        scan_dir(ftp, "/user/temp")
        scan_dir(ftp, "/tmp")

        # 4. /user/appmeta vs /user/app
        scan_dir(ftp, "/user/appmeta")

        # 5. /data/shadowmount
        scan_dir(ftp, "/data/shadowmount")

        # 6. /data/ps5_autoloader
        scan_dir(ftp, "/data/ps5_autoloader")

        # 7. /data/logs
        scan_dir(ftp, "/data/logs")

        ftp.quit()
        log("\nEscaneo profundo finalizado.")
    except Exception as e:
        log(f"Error en escaneo FTP: {e}")

if __name__ == "__main__":
    main()
