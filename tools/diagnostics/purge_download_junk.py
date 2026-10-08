import ftplib

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121, timeout=10)
ftp.login()

def safe_cmd(cmd):
    try:
        ftp.sendcmd(cmd)
    except Exception as e:
        pass

targets = [
    ('NPXS40140', ['download0.dat']),
    ('ITEM00001', ['download0.dat', 'download0_info.dat']),
    ('CUSA43942', ['download0.dat', 'download0_info.dat', 'download1.dat', 'download1_info.dat'])
]

total_freed = 0
for folder, files in targets:
    for f in files:
        path = f"/user/download/{folder}/{f}"
        try:
            sz = ftp.size(path)
            if sz:
                total_freed += sz
        except:
            pass
        safe_cmd(f"DELE {path}")
        print(f"[PURGA] Borrado: {path}")
    safe_cmd(f"RMD /user/download/{folder}")
    print(f"[PURGA] Directorio removido: /user/download/{folder}")

print(f"\n[+] Total liberado en /user/download: {total_freed / (1024**3):.2f} GB")
print("\n=== CONTENIDO ACTUAL DE /user/download ===")
ftp.dir('/user/download', print)
ftp.quit()
