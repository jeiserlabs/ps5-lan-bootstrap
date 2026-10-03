import ftplib
import re

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121, timeout=10)
ftp.login()

def get_dir_size(path):
    total = 0
    lines = []
    try:
        ftp.retrlines(f'LIST {path}', lines.append)
        for l in lines:
            parts = l.split()
            if len(parts) >= 9:
                name = parts[-1]
                if name in ('.', '..'): continue
                if parts[0].startswith('d'):
                    total += get_dir_size(f"{path}/{name}")
                else:
                    try:
                        total += int(parts[4])
                    except Exception:
                        pass
    except Exception:
        pass
    return total

def list_dirs(path):
    dirs = []
    lines = []
    try:
        ftp.retrlines(f'LIST {path}', lines.append)
        for l in lines:
            parts = l.split()
            if len(parts) >= 9 and parts[0].startswith('d'):
                name = parts[-1]
                if name not in ('.', '..'):
                    dirs.append(name)
    except Exception:
        pass
    return dirs

apps = list_dirs('/user/app')

print("=========================================================================")
print("CALCULANDO ESPACIO OCUPADO POR CADA JUEGO EN PS5 (VÍA FTP)")
print("=========================================================================")

total_bytes = 0
game_sizes = []

for tid in apps:
    app_sz = get_dir_size(f'/user/app/{tid}')
    patch_sz = get_dir_size(f'/user/patch/{tid}')
    addcont_sz = get_dir_size(f'/user/addcont/{tid}')
    
    tid_total = app_sz + patch_sz + addcont_sz
    total_bytes += tid_total
    
    gb = tid_total / (1024**3)
    game_sizes.append((tid, gb, app_sz/(1024**3), patch_sz/(1024**3), addcont_sz/(1024**3)))

game_sizes.sort(key=lambda x: x[1], reverse=True)

for tid, total_gb, a_gb, p_gb, c_gb in game_sizes:
    print(f"🎮 {tid:10s} : {total_gb:6.2f} GB  (Base: {a_gb:5.2f} GB | Patch: {p_gb:5.2f} GB | DLC: {c_gb:5.2f} GB)")

total_gb = total_bytes / (1024**3)
print("-------------------------------------------------------------------------")
print(f"TOTAL INSTALADO EN JUEGOS: {total_gb:.2f} GB")

# PS5 Slim usable capacity: ~848 GB (or ~667 GB if Fat)
# We can show both or calculate accurately!
ftp.quit()
