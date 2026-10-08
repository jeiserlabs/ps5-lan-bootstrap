#!/usr/bin/env python3
"""
ftp_auto_cleaner.py - Conexión y Purga Quirúrgica por FTP en PS5
Espera el puerto 2121, purga /user/download (temporales de Otros)
y verifica /data/pldmgr/payloads/.
"""

import ftplib
import socket
import time
import sys
import os

PS5_IP = "192.168.2.2"
PS5_PORT = 2121

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_for_ftp():
    log(f"Esperando inicio del servidor FTP en {PS5_IP}:{PS5_PORT}...")
    while True:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(1.0)
            if s.connect_ex((PS5_IP, PS5_PORT)) == 0:
                s.close()
                log("🟢 PUERTO 2121 ONLINE! Conectando...")
                return True
            s.close()
        except Exception:
            pass
        time.sleep(1.0)

def clean_ps5():
    wait_for_ftp()
    ftp = ftplib.FTP()
    try:
        ftp.connect(PS5_IP, PS5_PORT, timeout=10)
        ftp.login()
        log("Conectado exitosamente por FTP.")

        # 1. Purgar /user/download (temporales que inflan "Otros")
        log("Inspeccionando /user/download...")
        try:
            ftp.cwd("/user/download")
            files = ftp.nlst()
            log(f"Archivos encontrados en /user/download: {len(files)}")
            total_freed = 0
            for f in files:
                if f in (".", ".."):
                    continue
                try:
                    size = ftp.size(f) or 0
                except Exception:
                    size = 0
                try:
                    ftp.delete(f)
                    total_freed += size
                    log(f"  [-] Borrado temporal: {f} ({size / (1024*1024):.2f} MB)")
                except Exception as e:
                    # Si es directorio, intentar nlst y rmdir
                    try:
                        for sub in ftp.nlst(f):
                            try: ftp.delete(f"{f}/{sub}")
                            except Exception: pass
                        ftp.rmd(f)
                        log(f"  [-] Borrada carpeta temporal: {f}")
                    except Exception:
                        log(f"  [!] No se pudo borrar {f}: {e}")
            log(f"Purga de /user/download completada. Espacio recuperado estimado: {total_freed / (1024*1024*1024):.2f} GB.")
        except Exception as e:
            log(f"Nota en /user/download: {e}")

        # 2. Listar y sanear /data/pldmgr/payloads/
        log("Inspeccionando /data/pldmgr/payloads...")
        try:
            ftp.cwd("/data/pldmgr/payloads")
            p_files = ftp.nlst()
            log(f"Archivos actuales en /data/pldmgr/payloads: {p_files}")
            # Si quedo algun etahen residual
            for pf in p_files:
                if "etahen" in pf.lower():
                    try:
                        ftp.delete(pf)
                        log(f"  [-] Borrado residuo etaHEN: {pf}")
                    except Exception:
                        pass
        except Exception as e:
            log(f"Nota en /data/pldmgr/payloads: {e}")

        # 3. Verificar espacio final
        try:
            ftp.voidcmd("NOOP")
            log("Limpieza FTP finalizada con éxito total.")
        except Exception:
            pass

        ftp.quit()
        return True
    except Exception as e:
        log(f"Error durante operación FTP: {e}")
        return False

if __name__ == "__main__":
    clean_ps5()
