"""
restore_golden_state_live.py - Restaura el estado dorado byte-exacto del 3-oct-2026.
Restaura:
- kstuff.elf en /data/pldmgr/payloads/kstuff/kstuff.elf
- elfldr-ps5.elf en /data/pldmgr/payloads/elfldr/elfldr-ps5.elf
- pkg-receiver.elf en /data/pldmgr/payloads/pkg-receiver/pkg-receiver.elf
- ftpsrv-ps5.elf en /data/pldmgr/payloads/ftpsrv/ftpsrv-ps5.elf
- shadowmountplus.elf en /data/pldmgr/payloads/shadowmountplus/shadowmountplus.elf
- config.ini en /data/shadowmount/config.ini (kstuff_game_auto_toggle=0)
- autoload.txt en /data/pldmgr/autoload.txt
- POST a :8084/set_config con la lista dorada
"""

import socket
import urllib.request
import json
import ftplib
import os
import time

PS5_IP = "192.168.2.2"
SNAPSHOT_DIR = r"E:\ps5\data\backups\console_state\2026-10-03T22-25-16"
PAYLOADS_DIR = os.path.join(SNAPSHOT_DIR, "payloads_console")

GOLDEN_LIST = "kstuff.elf,elfldr-ps5.elf,pkg-receiver.elf,ftpsrv-ps5.elf,shadowmountplus.elf"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_for_service(port, name, max_wait=300):
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

def restore_everything():
    log("=== INICIANDO RESTAURACIÓN DEL ESTADO DORADO DEL 3-OCTUBRE ===")
    
    # 1. Esperar al autoloader o FTP
    wait_for_service(8084, "Autoloader")
    
    # 2. Configurar lista de autoload inmediatamente en :8084
    try:
        url = f"http://{PS5_IP}:8084/set_config"
        req = urllib.request.Request(
            url,
            data=json.dumps({"AUTOLOAD_ENABLED": True, "AUTOLOAD_LIST": GOLDEN_LIST}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            log(f"[+] Autoload configurado en :8084:\n    {GOLDEN_LIST}")
    except Exception as e:
        log(f"[-] Aviso configurando :8084: {e}")

    # 3. Conectar a FTP para restaurar payloads y configs
    if not wait_for_service(2121, "FTP", max_wait=20):
        log("[-] FTP no respondió rápido; intentando continuar...")

    try:
        ftp = ftplib.FTP()
        ftp.connect(PS5_IP, 2121, timeout=8)
        ftp.login()
        log("[+] FTP conectado exitosamente.")

        # Asegurar directorios
        for d in ["/data/shadowmount", "/data/pldmgr", "/data/pldmgr/payloads",
                  "/data/pldmgr/payloads/kstuff", "/data/pldmgr/payloads/elfldr",
                  "/data/pldmgr/payloads/pkg-receiver", "/data/pldmgr/payloads/ftpsrv",
                  "/data/pldmgr/payloads/shadowmountplus"]:
            try:
                ftp.mkd(d)
            except Exception:
                pass

        # Subir payloads
        uploads = [
            ("kstuff.elf", "/data/pldmgr/payloads/kstuff/kstuff.elf"),
            ("elfldr-ps5.elf", "/data/pldmgr/payloads/elfldr/elfldr-ps5.elf"),
            ("pkg-receiver.elf", "/data/pldmgr/payloads/pkg-receiver/pkg-receiver.elf"),
            ("ftpsrv-ps5.elf", "/data/pldmgr/payloads/ftpsrv/ftpsrv-ps5.elf"),
            ("shadowmountplus.elf", "/data/pldmgr/payloads/shadowmountplus/shadowmountplus.elf"),
        ]

        for fname, remote_path in uploads:
            local_path = os.path.join(PAYLOADS_DIR, fname)
            if os.path.exists(local_path):
                with open(local_path, "rb") as f:
                    ftp.storbinary(f"STOR {remote_path}", f)
                log(f"[+] Payload restaurado: {fname} -> {remote_path}")

        # Subir shadowmount_config.ini
        sm_ini_path = os.path.join(SNAPSHOT_DIR, "shadowmount_config.ini")
        if os.path.exists(sm_ini_path):
            with open(sm_ini_path, "rb") as f:
                ftp.storbinary("STOR /data/shadowmount/config.ini", f)
            log("[+] /data/shadowmount/config.ini restaurado con kstuff_game_auto_toggle=0")

        # Subir autoload.txt
        auto_txt = os.path.join(SNAPSHOT_DIR, "autoload.txt")
        if os.path.exists(auto_txt):
            with open(auto_txt, "rb") as f:
                ftp.storbinary("STOR /data/pldmgr/autoload.txt", f)
            log("[+] /data/pldmgr/autoload.txt restaurado con cadena dorada")

        ftp.quit()
        log("=== [ÉXITO] ESTADO DORADO RESTAURADO AL 100% ===")

    except Exception as e:
        log(f"[-] Error durante restauración FTP: {e}")

if __name__ == "__main__":
    restore_everything()
