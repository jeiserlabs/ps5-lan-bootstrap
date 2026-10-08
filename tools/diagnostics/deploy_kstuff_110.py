import socket
import urllib.request
import ftplib
import json
import time

PS5_IP = "192.168.2.2"
LOCAL_ELF = r"E:\ps5\payloads\kstuff-lite_v1.10.elf"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_for_port(port, timeout=0.5):
    s = socket.socket()
    s.settimeout(timeout)
    res = s.connect_ex((PS5_IP, port))
    s.close()
    return res == 0

def upload_via_http():
    log("[HTTP] Subiendo kstuff-lite_v1.10.elf via /manage:upload a :8084...")
    try:
        url = f"http://{PS5_IP}:8084/manage:upload?filename=kstuff-lite_v1.10.elf"
        with open(LOCAL_ELF, "rb") as f:
            data = f.read()
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/octet-stream"}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            log(f"[+] HTTP upload respuesta: {r.status} {r.read().decode()}")
            return True
    except Exception as e:
        log(f"[-] HTTP upload: {e}")
        return False

def upload_via_ftp():
    log("[FTP] Subiendo kstuff-lite_v1.10.elf via FTP :2121...")
    try:
        ftp = ftplib.FTP()
        ftp.connect(PS5_IP, 2121, timeout=10)
        ftp.login()
        for folder in ["/data/pldmgr/payloads/kstuff", "/data/pldmgr/payloads/kstuff110"]:
            try: ftp.mkd(folder)
            except: pass
            with open(LOCAL_ELF, "rb") as f:
                ftp.storbinary(f"STOR {folder}/kstuff-lite_v1.10.elf", f)
            log(f"[+] Subido a {folder}/kstuff-lite_v1.10.elf")
        ftp.quit()
        return True
    except Exception as e:
        log(f"[-] FTP upload: {e}")
        return False

def configure_autoload():
    log("[CFG] Fijando kstuff-lite_v1.10.elf en AUTOLOAD_LIST (:8084)...")
    chain = "kstuff-lite_v1.10.elf,!8000,pkg-receiver.elf,!2000,ftpsrv-ps5.elf"
    try:
        url = f"http://{PS5_IP}:8084/set_config"
        req = urllib.request.Request(
            url,
            data=json.dumps({"AUTOLOAD_ENABLED": True, "AUTOLOAD_LIST": chain}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            log(f"[+] Autoload configurado:\n    {chain}")
            return True
    except Exception as e:
        log(f"[-] Error configurando autoload: {e}")
        return False

def inject_in_memory():
    log("[LOAD] Disparando /loadpayload:kstuff-lite_v1.10.elf en caliente...")
    try:
        url = f"http://{PS5_IP}:8084/loadpayload:kstuff-lite_v1.10.elf"
        with urllib.request.urlopen(url, timeout=10) as r:
            res = r.read().decode()
            log(f"[+] Respuesta inyeccion kstuff 1.10: {res}")
            return True
    except Exception as e:
        log(f"[-] Error inyectando payload: {e}")
        return False

def main():
    log("=== CENTINELA kstuff 1.10 ARMADO: ESPERANDO A LA PS5 ===")
    while True:
        if wait_for_port(8084, 0.5):
            log("[+] Port 8084 detectado. Subiendo y configurando kstuff 1.10...")
            time.sleep(0.5)
            upload_via_http()
            if wait_for_port(2121, 1.0):
                upload_via_ftp()
            configure_autoload()
            inject_in_memory()
            log("=== [FIN] DESPLIEGUE DE kstuff 1.10 COMPLETADO ===")
            break
        elif wait_for_port(2121, 0.5):
            log("[+] Port 2121 detectado. Subiendo por FTP...")
            upload_via_ftp()
            if wait_for_port(8084, 1.0):
                configure_autoload()
                inject_in_memory()
            log("=== [FIN] DESPLIEGUE DE kstuff 1.10 COMPLETADO ===")
            break
        time.sleep(0.5)

if __name__ == "__main__":
    main()
