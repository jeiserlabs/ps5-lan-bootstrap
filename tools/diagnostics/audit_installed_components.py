import ftplib
import re

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121, timeout=5)
ftp.login()

def get_dirs(path):
    lines = []
    ftp.retrlines(f'LIST {path}', lines.append)
    dirs = []
    for l in lines:
        parts = l.split()
        if len(parts) >= 9:
            name = parts[-1]
            if name not in ('.', '..') and parts[0].startswith('d'):
                dirs.append(name)
    return dirs

apps = get_dirs('/user/app')
patches = get_dirs('/user/patch')
addconts = get_dirs('/user/addcont')

print('=== ALL APPS in /user/app ===')
print(apps)
print('\n=== ALL PATCHES in /user/patch ===')
print(patches)
print('\n=== ALL ADDCONTS in /user/addcont ===')
print(addconts)

ftp.quit()
