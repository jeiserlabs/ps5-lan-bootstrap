import socket
import urllib.request
import ftplib
import time
import os
import io

PS5_IP = "192.168.2.2"
LOCAL_ELF = r"E:\ps5\payloads\etaHEN.elf"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_for_port(port, timeout=1.0):
    s = socket.socket()
    s.settimeout(timeout)
    res = s.connect_ex((PS5_IP, port))
    s.close()
    return res == 0

def upload_via_http():
    log("[HTTP] Intentando subir etaHEN.elf via /manage:upload en port 8084...")
    try:
        url = f"http://{PS5_IP}:8084/manage:upload?filename=etaHEN.elf"
        with open(LOCAL_ELF, "rb") as f:
            data = f.read()
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/octet-stream"}
        )
        with urllib.request.urlopen(req, timeout=15) as r:
            log(f"[+] HTTP upload respuesta: {r.status} {r.read().decode()}")
            return True
    except Exception as e:
        log(f"[-] HTTP upload fallo: {e}")
        return False

def upload_via_ftp():
    log("[FTP] Intentando subir etaHEN.elf via FTP port 2121...")
    try:
        ftp = ftplib.FTP()
        ftp.connect(PS5_IP, 2121, timeout=10)
        ftp.login()
        for folder in ["/data/pldmgr/payloads/etahen", "/data/pldmgr/payloads/etaHEN"]:
            try: ftp.mkd(folder)
            except: pass
            with open(LOCAL_ELF, "rb") as f:
                ftp.storbinary(f"STOR {folder}/etaHEN.elf", f)
            log(f"[+] Subido a {folder}/etaHEN.elf")
        ftp.quit()
        return True
    except Exception as e:
        log(f"[-] FTP upload fallo: {e}")
        return False

def configure_autoload():
    log("[CFG] Configurando AUTOLOAD_LIST en :8084...")
    chain = "etaHEN.elf,!5000,pkg-receiver.elf,!2000,ftpsrv-ps5.elf"
    try:
        url = f"http://{PS5_IP}:8084/set_config"
        req = urllib.request.Request(
            url,
            data=json.dumps({"AUTOLOAD_LIST": chain}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            log(f"[+] AUTOLOAD_LIST fijada: {chain}")
            return True
    except Exception as e:
        log(f"[-] Error configurando autoload: {e}")
        return False

def load_payload():
    log("[LOAD] Disparando /loadpayload:etaHEN.elf...")
    try:
        url = f"http://{PS5_IP}:8084/loadpayload:etaHEN.elf"
        with urllib.request.urlopen(url, timeout=10) as r:
            log(f"[+] etaHEN ejecutado en caliente: {r.read().decode()}")
            return True
    except Exception as e:
        log(f"[-] Error cargando payload: {e}")
        return False

def main():
    log("=== CENTINELA etaHEN EN ESPERA DE LA PS5 ===")
    while True:
        if wait_for_port(8084, 0.5):
            log("[+] Port 8084 abierto. Iniciando despliegue de etaHEN...")
            time.sleep(1.0)
            http_ok = upload_via_http()
            # If FTP is up, also upload by FTP
            if wait_for_port(2121, 1.0):
                upload_via_ftp()
            configure_autoload()
            load_payload()
            log("=== DESPLIEGUE FINALIZADO ===")
            break
        elif wait_for_port(2121, 0.5):
            log("[+] Port 2121 abierto. Subiendo por FTP...")
            upload_via_ftp()
            if wait_for_port(8084, 1.0):
                configure_autoload()
                load_payload()
            log("=== DESPLIEGUE FINALIZADO ===")
            break
        time.sleep(1.0)

if __name__ == "__main__":
    import json
    main()
