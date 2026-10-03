import ftplib

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121, timeout=10)
ftp.login()

def delete_dir_recursive(path):
    try:
        lines = []
        ftp.retrlines(f'LIST {path}', lines.append)
        for l in lines:
            parts = l.split()
            if not parts or parts[-1] in ['.', '..']:
                continue
            name = parts[-1]
            sub = f"{path}/{name}"
            if l.startswith('d'):
                delete_dir_recursive(sub)
            else:
                try:
                    res = ftp.sendcmd(f'DELE {sub}')
                    print(f"DELE {sub} -> {res}")
                except Exception as e:
                    print(f"Error dele {sub}: {e}")
        try:
            res = ftp.sendcmd(f'RMD {path}')
            print(f"RMD {path} -> {res}")
        except Exception as e:
            print(f"Error rmd {path}: {e}")
    except Exception as e:
        print(f"Error listing {path}: {e}")

print("=== PURGANDO CUSA14876 ===")
delete_dir_recursive('/user/addcont/CUSA14876')

print("\n=== PURGANDO CUSA01967 (Horizon DLC) ===")
delete_dir_recursive('/user/addcont/CUSA01967')

ftp.quit()
print("\nLimpieza completada.")
