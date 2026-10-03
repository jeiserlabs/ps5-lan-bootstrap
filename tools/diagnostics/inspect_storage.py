import ftplib

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121, timeout=10)
ftp.login()

def get_dir_size(path):
    total = 0
    try:
        lines = []
        ftp.retrlines(f'LIST {path}', lines.append)
        for line in lines:
            parts = line.split()
            if not parts:
                continue
            name = parts[-1]
            if name in ['.', '..']:
                continue
            if line.startswith('d'):
                total += get_dir_size(f'{path}/{name}')
            else:
                try:
                    total += int(parts[4])
                except:
                    pass
    except Exception:
        pass
    return total

def list_folder_sizes(parent):
    print(f"\n=== SIZES IN {parent} ===")
    lines = []
    ftp.retrlines(f'LIST {parent}', lines.append)
    for line in lines:
        parts = line.split()
        if not parts:
            continue
        name = parts[-1]
        if name in ['.', '..']:
            continue
        if line.startswith('d'):
            sz = get_dir_size(f"{parent}/{name}")
            print(f"{name:15}: {sz / (1024**3):6.2f} GB")

list_folder_sizes('/user/app')
list_folder_sizes('/user/patch')
list_folder_sizes('/user/addcont')

print("\n=== TOP LEVEL /user ===")
lines = []
ftp.retrlines('LIST /user', lines.append)
for l in lines:
    print(l)

ftp.quit()
