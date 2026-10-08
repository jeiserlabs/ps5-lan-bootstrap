"""
deploy_etahen_1340.py - Despliega el nuevo etaHEN Unificado 11.00-13.60 (36.7 MB)
con la secuencia de delays solicitada por el usuario (!8000 -> payload -> !5000 -> payload -> !5000).
"""

import socket
import urllib.request
import json
import ftplib
import os
import time

PS5_IP = "192.168.2.2"
LOCAL_ETAHEN = r"e:\ps5\payloads\etaHEN-11.00-13.60.elf"
AUTOLOAD_CHAIN = "!8000,etaHEN.elf,!5000,pkg-receiver.elf,!5000,ftpsrv-ps5.elf"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_for_port(port, name, max_wait=300):
    log(f"Esperando a que {name} ({PS5_IP}:{port}) responda...")
    start = time.time()
    while time.time() - start < max_wait:
        try:
            s = socket.socket()
            s.settimeout(0.5)
            if s.connect_ex((PS5_IP, port)) == 0:
                s.close()
                log(f"[+] {name} ({port}) DETECTADO ONLINE.")
                return True
            s.close()
        except Exception:
            pass
        time.sleep(0.5)
    return False

def deploy():
    log("=== PREPARANDO DESPLIEGUE ETAHEN UNIFICADO 11.00-13.60 ===")
    
    # 1. Esperar autoloader
    wait_for_port(8084, "Autoloader")
    
    # 2. Configurar cadena con delays exactos en :8084
    try:
        url = f"http://{PS5_IP}:8084/set_config"
        req = urllib.request.Request(
            url,
            data=json.dumps({"AUTOLOAD_ENABLED": True, "AUTOLOAD_LIST": AUTOLOAD_CHAIN}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            log(f"[+] Cadena de autoload configurada con delays:\n    {AUTOLOAD_CHAIN}")
    except Exception as e:
        log(f"[-] Error configurando autoload :8084: {e}")

    # 3. Subir nuevo binario por FTP
    if not wait_for_port(2121, "FTP", max_wait=30):
        log("[-] FTP no respondió rápido; esperando...")

    try:
        ftp = ftplib.FTP()
        ftp.connect(PS5_IP, 2121, timeout=10)
        ftp.login()
        log("[+] FTP conectado. Subiendo etaHEN-11.00-13.60.elf (36.7 MB)...")

        # Asegurar directorio
        try:
            ftp.mkd("/data/pldmgr/payloads/etaHEN")
        except Exception:
            pass

        remote_dest = "/data/pldmgr/payloads/etaHEN/etaHEN.elf"
        with open(LOCAL_ETAHEN, "rb") as f:
            ftp.storbinary(f"STOR {remote_dest}", f)
        log(f"[+] etaHEN unificado subido exitosamente a {remote_dest}")

        # Escribir autoload.txt en disco de PS5
        auto_content = "\n".join(["!8000", "etaHEN.elf", "!5000", "pkg-receiver.elf", "!5000", "ftpsrv-ps5.elf", ""])
        import io
        ftp.storbinary("STOR /data/pldmgr/autoload.txt", io.BytesIO(auto_content.encode("utf-8")))
        log("[+] /data/pldmgr/autoload.txt actualizado con delays de 8s y 5s")

        ftp.quit()
        log("=== [ÉXITO] ETAHEN Y DELAYS LISTOS EN PS5 ===")

    except Exception as e:
        log(f"[-] Error en FTP: {e}")

if __name__ == "__main__":
    deploy()
