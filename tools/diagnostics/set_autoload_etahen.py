import socket
import time
import urllib.request
import json
from ftplib import FTP
import io

PS5_IP = "192.168.2.2"
AUTOLOAD_CHAIN = "!8000,etaHEN.elf,!5000,pkg-receiver.elf,!5000,ftpsrv-ps5.elf"
AUTOLOAD_TXT = b"!8000\netaHEN.elf\n!5000\npkg-receiver.elf\n!5000\nftpsrv-ps5.elf\n"

def wait_for_ps5():
    print(f"[*] Esperando conexion con PS5 ({PS5_IP})...")
    while True:
        # Check port 8084 or 2121
        for port in [8084, 2121]:
            s = socket.socket()
            s.settimeout(0.5)
            if s.connect_ex((PS5_IP, port)) == 0:
                s.close()
                print(f"[+] PS5 responde en puerto {port}!")
                return port
            s.close()
        time.sleep(1)

def apply_etahen_chain():
    port = wait_for_ps5()
    
    # Update via 8084 if available
    try:
        url = f"http://{PS5_IP}:8084/set_config"
        data = json.dumps({"AUTOLOAD_LIST": AUTOLOAD_CHAIN}).encode()
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        resp = urllib.request.urlopen(req, timeout=3).read().decode()
        print(f"[+] Payload Manager :8084 actualizado con exito: {resp}")
    except Exception as e:
        print(f"[-] Error en :8084: {e}")
        
    # Update via FTP if available
    try:
        ftp = FTP()
        ftp.connect(PS5_IP, 2121, timeout=5)
        ftp.login()
        ftp.cwd('/data/pldmgr')
        ftp.storbinary('STOR autoload.txt', io.BytesIO(AUTOLOAD_TXT))
        ftp.quit()
        print("[+] /data/pldmgr/autoload.txt actualizado con etaHEN en PS5!")
    except Exception as e:
        print(f"[-] Error en FTP: {e}")

if __name__ == "__main__":
    apply_etahen_chain()
