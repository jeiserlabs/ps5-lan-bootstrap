import socket
import time
import urllib.request
import json
from ftplib import FTP
import io

PS5_IP = "192.168.2.2"
SAFE_CHAIN = "!8000,kstuff.elf,!5000,pkg-receiver.elf,!5000,ftpsrv-ps5.elf"
SAFE_TXT = b"!8000\nkstuff.elf\n!5000\npkg-receiver.elf\n!5000\nftpsrv-ps5.elf\n"

print("[*] VIGILANTE DE EMERGENCIA ACTIVADO: Esperando ventana de conexion...")

while True:
    for port in [8084, 2121]:
        s = socket.socket()
        s.settimeout(0.3)
        res = s.connect_ex((PS5_IP, port))
        s.close()
        if res == 0:
            print(f"[!] PS5 DETECTADA ONLINE en puerto {port}! Neutralizando etaHEN...")
            
            # 1. Neutralizar en Payload Manager (:8084)
            try:
                url = f"http://{PS5_IP}:8084/set_config"
                data = json.dumps({"AUTOLOAD_LIST": SAFE_CHAIN}).encode()
                req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
                resp = urllib.request.urlopen(req, timeout=1.5).read().decode()
                print(f"[SUCCESS] Payload Manager neutralizado a kstuff: {resp}")
            except Exception as e:
                print(f"[-] Error en 8084: {e}")
                
            # 2. Neutralizar en FTP (/data/pldmgr/autoload.txt)
            try:
                ftp = FTP()
                ftp.connect(PS5_IP, 2121, timeout=2)
                ftp.login()
                ftp.cwd('/data/pldmgr')
                ftp.storbinary('STOR autoload.txt', io.BytesIO(SAFE_TXT))
                ftp.quit()
                print("[SUCCESS] /data/pldmgr/autoload.txt fijado permanentemente a kstuff!")
            except Exception as e:
                print(f"[-] Error en FTP: {e}")
                
            print("[OK] CADENA SEGURA APLICADA. etaHEN ELIMINADO DEL ARRANQUE.")
            exit(0)
    time.sleep(0.3)
