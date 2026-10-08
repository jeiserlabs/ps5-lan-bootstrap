import time, os, subprocess, re

log_file = r'e:\ps5\data\logs\ps5_pipeline.log'
base_name = 'EP0700-CUSA32836_00-A0100-V0100-CyB1K-[DLPSGAME.COM].pkg'
target_size = 24383848448

print('[*] Monitoreando fin de Base PKG (24.38 GB)...')
for i in range(40):
    if os.path.exists(log_file):
        with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
        last_range = None
        for line in reversed(lines):
            if base_name in line and 'RANGE "bytes=' in line:
                last_range = line.strip()
                break
        if last_range:
            m = re.search(r'bytes=(\d+)-(\d+)', last_range)
            if m:
                end_byte = int(m.group(2))
                pct = (end_byte / target_size) * 100
                sec = i * 2
                print(f'[{sec}s] Transmitido: {end_byte / (1024**3):.2f} / 22.71 GB ({pct:.1f}%)')
                if end_byte >= target_size - 0x400000:
                    print('[+] 100% transferido!')
                    break
    time.sleep(2)

print('[*] Verificando en PS5 por FTP...')
for j in range(40):
    res = subprocess.run(['python', r'e:\ps5\pipeline\scripts\verify_installed_ftp.py', 'CUSA32836', 'BASE'], capture_output=True, text=True)
    if 'OK' in res.stdout:
        print('[SUCCESS] CUSA32836 BASE confirmado e instalado en PS5!')
        break
    sec = j * 2
    print(f'Esperando consolidacion PS5... ({sec}s)')
    time.sleep(2)
