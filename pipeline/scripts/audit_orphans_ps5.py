#!/usr/bin/env python3
import sys
import ftplib

PS5_IP = "192.168.2.2"
FTP_PORT = 2121

TITLE_NAMES = {
    "CUSA13795": "Crash Team Racing Nitro-Fueled",
    "CUSA43942": "MLB The Show 24",
    "CUSA11518": "Mortal Kombat 11 Ultimate",
    "CUSA16742": "It Takes Two",
    "CUSA02299": "Marvel's Spider-Man (2018)",
    "CUSA28561": "Horizon Forbidden West",
    "CUSA07408": "God of War (2018)",
    "CUSA13323": "Ghost of Tsushima Director's Cut",
    "CUSA07995": "A Way Out",
    "CUSA23384": "Haven",
    "SLUG51851": "Carritos N64",
    "CUSA03173": "Bloodborne",
    "CUSA34384": "God of War Ragnarök",
    "CUSA01967": "Horizon Zero Dawn",
    "CUSA17722": "Spider-Man: Miles Morales"
}

def parse_ftp_list(lines):
    items = []
    for l in lines:
        parts = l.split()
        if len(parts) >= 9:
            name = parts[-1]
            if name not in ('.', '..'):
                is_dir = l.startswith('d')
                try: size = int(parts[4])
                except: size = 0
                items.append({'name': name, 'is_dir': is_dir, 'size': size})
    return items

def get_items(ftp, path):
    lines = []
    try:
        ftp.retrlines(f"LIST {path}", lines.append)
    except:
        return []
    return parse_ftp_list(lines)

def run():
    try: sys.stdout.reconfigure(encoding="utf-8")
    except: pass

    ftp = ftplib.FTP()
    ftp.connect(PS5_IP, FTP_PORT, timeout=10)
    ftp.login()

    apps = {i['name']: i for i in get_items(ftp, '/user/app') if i['is_dir']}
    patches = {i['name']: i for i in get_items(ftp, '/user/patch') if i['is_dir']}
    addconts = {i['name']: i for i in get_items(ftp, '/user/addcont') if i['is_dir']}

    print("=== 1. JUEGOS BASE (/user/app) ===")
    real_bases = set()
    empty_stubs = []
    for name, it in sorted(apps.items()):
        sub = get_items(ftp, f'/user/app/{name}')
        total_sz = sum(s['size'] for s in sub if not s['is_dir'])
        has_pkg = any('app.pkg' in s['name'] for s in sub)
        title = TITLE_NAMES.get(name, f"System / Otro ({name})")
        if total_sz > 10 * 1024 * 1024 or has_pkg:
            real_bases.add(name)
            print(f"  [BASE REAL] {name} ({title}): {total_sz / (1024**3):.2f} GB | app.pkg={has_pkg}")
        else:
            empty_stubs.append((name, total_sz))

    if empty_stubs:
        print(f"\n  [CARPETAS VACÍAS / STUBS DEL SISTEMA EN /user/app]:")
        for s, sz in empty_stubs:
            print(f"    - {s} ({sz} bytes)")

    print("\n=== 2. UPDATES (/user/patch) ===")
    orphan_patches = []
    for name, it in sorted(patches.items()):
        sub = get_items(ftp, f'/user/patch/{name}')
        total_sz = sum(s['size'] for s in sub if not s['is_dir'])
        has_pkg = any('patch.pkg' in s['name'] for s in sub)
        has_base = name in real_bases
        title = TITLE_NAMES.get(name, name)
        status = "VINCULADO A BASE" if has_base else "HUÉRFANO (SIN BASE)"
        if not has_base:
            orphan_patches.append((name, total_sz))
        print(f"  [{status}] {name} ({title}): {total_sz / (1024**3):.2f} GB | patch.pkg={has_pkg}")

    print("\n=== 3. DLCs (/user/addcont) ===")
    orphan_dlcs = []
    for name, it in sorted(addconts.items()):
        sub = get_items(ftp, f'/user/addcont/{name}')
        dlc_dirs = [s['name'] for s in sub if s['is_dir']]
        has_base = name in real_bases
        title = TITLE_NAMES.get(name, name)
        status = "VINCULADO A BASE" if has_base else "HUÉRFANO (SIN BASE)"
        if not has_base:
            orphan_dlcs.append((name, dlc_dirs))
        print(f"  [{status}] {name} ({title}): {len(dlc_dirs)} DLCs -> {dlc_dirs}")

    print("\n=== 4. ARCHIVOS TEMPORALES / RESIDUOS DE DESCARGA ===")
    dirs_to_check = ['/user/download', '/user/temp', '/user/data/temp', '/data/download']
    found_garbage = False
    for d in dirs_to_check:
        items = get_items(ftp, d)
        if items:
            names = [it['name'] for it in items]
            print(f"  ⚠️ {d}: {len(items)} archivos encontrados -> {names}")
            found_garbage = True
        else:
            print(f"  ✅ {d}: Limpio (vacío o inexistente)")

    print("\n================== RESUMEN DE LA AUDITORÍA ==================")
    print(f"Total Juegos Base Reales: {len(real_bases)}")
    print(f"Updates Huérfanos: {len(orphan_patches)}")
    print(f"DLCs Huérfanos: {len(orphan_dlcs)}")
    print(f"Carpetas Vacías/Stubs: {len(empty_stubs)}")
    if not orphan_patches and not orphan_dlcs and not found_garbage:
        print("🎯 ESTADO: ALMACENAMIENTO 100% LIMPIO, CERO ARCHIVOS HUÉRFANOS.")
    else:
        if orphan_patches:
            print(f"⚠️ Updates huérfanos detectados: {[p[0] for p in orphan_patches]}")
        if orphan_dlcs:
            print(f"⚠️ DLCs huérfanos detectados: {[d[0] for d in orphan_dlcs]}")

    ftp.quit()

if __name__ == '__main__':
    run()
