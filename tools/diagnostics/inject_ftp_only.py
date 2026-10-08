#!/usr/bin/env python3
"""
inject_ftp_only.py - Inyector exclusivo de FTP (ftpsrv-ps5.elf)
Detecta ELF Loader en 9020/9021, inyecta ftpsrv y verifica puerto 2121.
CERO kstuff, CERO daemons.
"""

import socket
import time
import sys
import os

PS5_IP = "192.168.2.2"
FTP_ELF = r"E:\ps5\payloads\ftpsrv-ps5.elf"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def inject():
    if not os.path.exists(FTP_ELF):
        log(f"ERROR: No existe {FTP_ELF}")
        return False

    with open(FTP_ELF, "rb") as f:
        elf_data = f.read()

    log(f"ftpsrv-ps5.elf listo ({len(elf_data)} bytes).")
    log(f"Esperando exploit / ELF Loader en {PS5_IP} (puertos 9020/9021)...")

    target_port = None
    while True:
        for port in (9020, 9021):
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.settimeout(0.5)
                if s.connect_ex((PS5_IP, port)) == 0:
                    target_port = port
                    s.close()
                    break
                s.close()
            except Exception:
                pass
        if target_port:
            break
        time.sleep(0.5)

    log(f"ELF Loader detectado en puerto {target_port}! Inyectando ftpsrv...")
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5.0)
        s.connect((PS5_IP, target_port))
        s.sendall(elf_data)
        s.close()
        log("Inyección enviada con éxito.")
    except Exception as e:
        log(f"Error al enviar: {e}")
        return False

    log("Esperando inicio de servidor FTP en puerto 2121...")
    time.sleep(1.5)
    for _ in range(10):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(1.0)
            if s.connect_ex((PS5_IP, 2121)) == 0:
                s.close()
                log("FTP ACTIVO en 192.168.2.2:2121! Listo para purga.")
                return True
            s.close()
        except Exception:
            pass
        time.sleep(1.0)

    log("Advertencia: Puerto 2121 no respondió tras inyección.")
    return False

if __name__ == "__main__":
    inject()
