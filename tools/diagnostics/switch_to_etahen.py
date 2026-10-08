import ftplib
import io
import json
import urllib.request
import socket
import time
import os

PS5_IP = "192.168.2.2"
LOCAL_ETAHEN = r"E:\ps5\payloads\etaHEN.elf"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_for_connection():
    log(f"Esperando a que enciendas la PS5 y cargues el jailbreak ({PS5_IP}:2121 / :8084)...")
    while True:
        try:
            s = socket.socket()
            s.settimeout(1.0)
            res = s.connect_ex((PS5_IP, 2121))
            s.close()
            if res == 0:
                log("[+] ¡PS5 DETECTADA (FTP 2121 ABIERTO)!")
                return True
        except Exception:
            pass
        try:
            s = socket.socket()
            s.settimeout(1.0)
            res = s.connect_ex((PS5_IP, 8084))
            s.close()
            if res == 0:
                log("[+] ¡PS5 DETECTADA (Payload Manager 8084 ABIERTO)!")
                return True
        except Exception:
            pass
        time.sleep(1.0)

def switch_to_etahen():
    wait_for_connection()

    # 1. Subir etaHEN.elf por FTP a /data/pldmgr/payloads/etahen/
    log("=== [1] SUBIENDO etaHEN 2.5B A LA PS5 ===")
    try:
        ftp = ftplib.FTP()
        ftp.connect(PS5_IP, 2121, timeout=10)
        ftp.login()

        try:
            ftp.mkd("/data/pldmgr/payloads/etahen")
        except Exception:
            pass

        with open(LOCAL_ETAHEN, "rb") as f:
            ftp.storbinary("STOR /data/pldmgr/payloads/etahen/etaHEN.elf", f)
        log("[+] etaHEN.elf subido por FTP a /data/pldmgr/payloads/etahen/etaHEN.elf")

        # Subir metadata json
        meta = {
            "display_name": "etaHEN 2.5B",
            "description": "etaHEN AIO Homebrew Enabler",
            "version": "2.5B",
            "author": "LightningMods"
        }
        bio_meta = io.BytesIO(json.dumps(meta, indent=2).encode())
        ftp.storbinary("STOR /data/pldmgr/payloads/etahen/etaHEN.elf.json", bio_meta)
        log("[+] etaHEN.elf.json subido exitosamente.")
        ftp.quit()
    except Exception as e:
        log(f"[-] Error subiendo por FTP: {e}")

    # 2. Configurar nueva cadena de Autoload en :8084 reemplazando kstuff por etaHEN
    log("=== [2] REEMPLAZANDO kstuff POR etaHEN EN AUTOLOAD (:8084) ===")
    new_chain = "etaHEN.elf,!5000,pkg-receiver.elf,!2000,ftpsrv-ps5.elf"
    try:
        url = f"http://{PS5_IP}:8084/set_config"
        req = urllib.request.Request(
            url,
            data=json.dumps({"AUTOLOAD_LIST": new_chain}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            log(f"[+] Autoloader actualizado: AUTOLOAD_LIST = {new_chain}")
    except Exception as e:
        log(f"[-] Error configurando 8084: {e}")

    # 3. Inyectar etaHEN en caliente por :8084
    log("=== [3] INYECTANDO etaHEN.elf EN CALIENTE ===")
    try:
        load_url = f"http://{PS5_IP}:8084/loadpayload:etaHEN.elf"
        with urllib.request.urlopen(load_url, timeout=10) as r:
            res = r.read().decode()
            log(f"[+] Respuesta inyeccion etaHEN: {res}")
    except Exception as e:
        log(f"[!] Aviso al inyectar en caliente: {e} (ya queda fijado para el próximo arranque)")

    log("=== [FIN] TRANSICIÓN A etaHEN COMPLETADA ===")

if __name__ == "__main__":
    switch_to_etahen()
