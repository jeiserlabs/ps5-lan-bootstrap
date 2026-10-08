import os
import time
import urllib.request
import urllib.parse
import ftplib

PC_IP = "192.168.2.1"
PC_PORT = 9898
PS5_IP = "192.168.2.2"
PS5_PORT = 12800
TITLE_ID = "CUSA32836"
DLC_DIR = r"C:\Users\dev\Desktop\NARUTO_DLCS"

# Connect FTP to check current installed
ftp = ftplib.FTP()
ftp.connect(PS5_IP, 2121, timeout=5)
ftp.login()

lines = []
ftp.retrlines(f"LIST /user/addcont/{TITLE_ID}", lines.append)
installed_keys = set()
for l in lines:
    parts = l.split()
    if len(parts) >= 9:
        name = parts[-1]
        if name not in ('.', '..'):
            installed_keys.add(name)

print(f"Actualmente en PS5 ({len(installed_keys)} DLCs instalados):")
for k in sorted(installed_keys):
    print(f"  ✓ {k}")

dlc_files = [f for f in os.listdir(DLC_DIR) if f.endswith('.pkg')]
print(f"\nTotal DLCs en PC: {len(dlc_files)}")

for idx, f in enumerate(sorted(dlc_files), 1):
    print(f"\n[{idx}/{len(dlc_files)}] Procesando: {f}")
    encoded_file = urllib.parse.quote(f)
    pkg_url = f"http://{PC_IP}:{PC_PORT}/pkg/{encoded_file}"
    install_url = f"http://{PS5_IP}:{PS5_PORT}/install?url={urllib.parse.quote(pkg_url)}&name={encoded_file}"
    
    try:
        req = urllib.request.Request(install_url)
        with urllib.request.urlopen(req, timeout=10) as resp:
            print("  Disparo enviado a :12800 ->", resp.read().decode().strip())
    except Exception as e:
        print("  Error en disparo:", e)
        continue
    
    time.sleep(3)

# Verificar final
print("\n=== VERIFICACIÓN FINAL EN FTP ===")
lines_final = []
ftp.retrlines(f"LIST /user/addcont/{TITLE_ID}", lines_final.append)
ftp.quit()

installed_final = [l.split()[-1] for l in lines_final if len(l.split()) >= 9 and l.split()[-1] not in ('.', '..')]
print(f"Total DLCs instalados en /user/addcont/{TITLE_ID}: {len(installed_final)}")
for k in sorted(installed_final):
    print(f"  ✓ {k}")
