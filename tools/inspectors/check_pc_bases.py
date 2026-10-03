import os
import re

lib_dirs = [r'C:\Biblioteca_Juegos_PS', r'E:\Biblioteca_Juegos_PS']

pkgs_by_title = {}
for base in lib_dirs:
    for root, dirs, files in os.walk(base):
        for f in files:
            if f.lower().endswith('.pkg'):
                m = re.search(r'[A-Za-z]{4}\d{5}', f)
                tid = m.group(0).upper() if m else 'UNKNOWN'
                if tid not in pkgs_by_title:
                    pkgs_by_title[tid] = []
                pkgs_by_title[tid].append(os.path.join(root, f))

print("=== REVISION DE BASES VS UPDATES/DLCS EN PC ===")
for tid, files in sorted(pkgs_by_title.items()):
    has_base = any('v1.00' in f.lower() or 'game' in f.lower() or 'fullgame' in f.lower() for f in files)
    print(f"[{tid}] {len(files)} archivos | Base detectada: {has_base}")
    if not has_base:
        for f in files:
            print(f"   -> HUERFANO? {os.path.basename(f)}")
