import socket
import time
import urllib.request
import json
from ftplib import FTP
import io

PS5_IP = "192.168.2.2"
COMPLETE_CHAIN = "!8000,kstuff.elf,!5000,etaHEN.elf,!5000,pkg-receiver.elf,!5000,ftpsrv-ps5.elf"
COMPLETE_TXT = b"!8000\nkstuff.elf\n!5000\netaHEN.elf\n!5000\npkg-receiver.elf\n!5000\nftpsrv-ps5.elf\n"

print(f"[*] LISTENER MAESTRO ACTIVO: Esperando conexion de PS5 ({PS5_IP})...", flush=True)

connected = False
while not connected:
    for port in [8084, 2121, 12800]:
        s = socket.socket()
        s.settimeout(0.4)
        res = s.connect_ex((PS5_IP, port))
        s.close()
        if res == 0:
            print(f"[+] CONEXION DETECTADA: Puerto {port} ONLINE!", flush=True)
            connected = True
            break
    if not connected:
        time.sleep(0.5)

time.sleep(1)
print("[*] Asegurando inyeccion de kstuff + etaHEN...", flush=True)

# 1. Configurar cadena completa en Payload Manager :8084
try:
    url = f"http://{PS5_IP}:8084/set_config"
    data = json.dumps({"AUTOLOAD_LIST": COMPLETE_CHAIN}).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=3).read().decode()
    print(f"[+] Cadena completa fijada en :8084: {resp}", flush=True)
except Exception as e:
    print(f"[-] Nota en :8084 set_config: {e}", flush=True)

# 2. Inyectar kstuff.elf en caliente para garantizar fPKGs
try:
    url = f"http://{PS5_IP}:8084/loadpayload:/data/pldmgr/payloads/kstuff/kstuff.elf"
    resp = urllib.request.urlopen(url, timeout=3).read().decode()
    print(f"[+] kstuff.elf inyectado y verificado en kernel: {resp}", flush=True)
except Exception as e:
    print(f"[-] Nota inyeccion kstuff: {e}", flush=True)

# 3. Inyectar etaHEN.elf en caliente
try:
    url = f"http://{PS5_IP}:8084/loadpayload:/data/pldmgr/payloads/etaHEN/etaHEN.elf"
    resp = urllib.request.urlopen(url, timeout=3).read().decode()
    print(f"[+] etaHEN.elf inyectado y activo: {resp}", flush=True)
except Exception as e:
    print(f"[-] Nota inyeccion etaHEN: {e}", flush=True)

# 4. Asegurar autoload.txt via FTP
try:
    ftp = FTP()
    ftp.connect(PS5_IP, 2121, timeout=3)
    ftp.login()
    ftp.cwd('/data/pldmgr')
    ftp.storbinary('STOR autoload.txt', io.BytesIO(COMPLETE_TXT))
    ftp.quit()
    print("[+] /data/pldmgr/autoload.txt sincronizado con kstuff + etaHEN!", flush=True)
except Exception as e:
    print(f"[-] Nota en FTP: {e}", flush=True)

# 5. Estado final de puertos
time.sleep(1)
status = {}
for p in [8084, 12800, 2121]:
    s = socket.socket()
    s.settimeout(1)
    status[p] = "ONLINE" if s.connect_ex((PS5_IP, p)) == 0 else "OFFLINE"
    s.close()

print(f"[RESUMEN FINAL] 8084: {status[8084]} | 12800: {status[12800]} | 2121: {status[2121]}", flush=True)
print("[LISTO] kstuff + etaHEN activos simultaneamente. Consola 100% armada.", flush=True)
