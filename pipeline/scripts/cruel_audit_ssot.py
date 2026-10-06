#!/usr/bin/env python3
"""
cruel_audit_ssot.py — Auditoria implacable del almacenamiento de la PS5 via FTP.
Inspecciona directamente el sistema de archivos (/user/app, /user/patch, /user/addcont)
y sincroniza el SSOT de installed_pkgs.json.
Cero suposiciones. Cero falsos positivos.
"""
import os
import sys
import json
import ftplib

PS5_IP = "192.168.2.2"
FTP_PORT = 2121
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SSOT_PATH1 = os.path.join(ROOT, "data", "cache", "ps5", "installed_pkgs.json")
SSOT_PATH2 = os.path.join(ROOT, "installed_pkgs_ps5.json")

# Diccionario maestro de mapeo TitleID -> Nombre del juego
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
    "CUSA17722": "Marvel's Spider-Man: Miles Morales"
}

def parse_ftp_list(lines):
    items = []
    for l in lines:
        parts = l.split()
        if len(parts) >= 9:
            name = parts[-1]
            if name not in ('.', '..'):
                is_dir = l.startswith('d')
                try:
                    size = int(parts[4])
                except:
                    size = 0
                items.append({'name': name, 'is_dir': is_dir, 'size': size})
    return items

def get_dir_size_and_files(ftp, path):
    lines = []
    try:
        ftp.retrlines(f"LIST {path}", lines.append)
    except:
        return 0, []
    items = parse_ftp_list(lines)
    total_size = sum(it['size'] for it in items if not it['is_dir'])
    file_names = [it['name'] for it in items]
    return total_size, file_names

def run_cruel_audit():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except:
        pass

    ftp = ftplib.FTP()
    ftp.connect(PS5_IP, FTP_PORT, timeout=10)
    ftp.login()

    # 1. Obtener carpetas de /user/app
    app_lines = []
    ftp.retrlines("LIST /user/app", app_lines.append)
    apps = [it['name'] for it in parse_ftp_list(app_lines) if it['is_dir']]

    # 2. Obtener carpetas de /user/patch
    patch_lines = []
    ftp.retrlines("LIST /user/patch", patch_lines.append)
    patches = [it['name'] for it in parse_ftp_list(patch_lines) if it['is_dir']]

    # 3. Obtener carpetas de /user/addcont
    addcont_lines = []
    ftp.retrlines("LIST /user/addcont", addcont_lines.append)
    addconts = [it['name'] for it in parse_ftp_list(addcont_lines) if it['is_dir']]

    all_tids = sorted(list(set(apps + patches + addconts)))

    audit_data = {}
    verified_pkgs = []

    for tid in all_tids:
        title = TITLE_NAMES.get(tid, f"Desconocido ({tid})")
        
        # Auditoria Base
        has_base = False
        base_size = 0
        base_files = []
        if tid in apps:
            base_size, base_files = get_dir_size_and_files(ftp, f"/user/app/{tid}")
            has_base = ("app.pkg" in base_files) or (base_size > 10 * 1024 * 1024)

        # Auditoria Update (Patch)
        has_patch = False
        patch_size = 0
        patch_files = []
        if tid in patches:
            patch_size, patch_files = get_dir_size_and_files(ftp, f"/user/patch/{tid}")
            has_patch = ("patch.pkg" in patch_files) or (patch_size > 10 * 1024 * 1024)

        # Auditoria DLCs (Addcont)
        dlc_list = []
        if tid in addconts:
            dlc_lines = []
            try:
                ftp.retrlines(f"LIST /user/addcont/{tid}", dlc_lines.append)
                dlc_items = parse_ftp_list(dlc_lines)
                for d in dlc_items:
                    if d['is_dir']:
                        dlc_list.append(d['name'])
            except:
                pass

        audit_data[tid] = {
            "title": title,
            "has_base": has_base,
            "base_size_gb": round(base_size / (1024**3), 2),
            "has_patch": has_patch,
            "patch_size_gb": round(patch_size / (1024**3), 2),
            "dlcs": dlc_list
        }

        # Registrar en SSOT
        if has_base:
            verified_pkgs.append(f"{tid}_BASE.pkg")
        if has_patch:
            verified_pkgs.append(f"{tid}_UPDATE.pkg")
        for d in dlc_list:
            verified_pkgs.append(f"{tid}_DLC_{d}.pkg")

    ftp.quit()

    # Guardar SSOT sincronizado
    os.makedirs(os.path.dirname(SSOT_PATH1), exist_ok=True)
    audit_obj_path = os.path.join(ROOT, "data", "cache", "ps5", "ps5_ground_truth_audit.json")
    with open(audit_obj_path, 'w', encoding='utf-8') as f:
        json.dump(audit_data, f, indent=2, ensure_ascii=False)
    with open(SSOT_PATH1, 'w', encoding='utf-8') as f:
        json.dump(verified_pkgs, f, indent=2, ensure_ascii=False)
    with open(SSOT_PATH2, 'w', encoding='utf-8') as f:
        json.dump(verified_pkgs, f, indent=2, ensure_ascii=False)

    return audit_data

if __name__ == "__main__":
    result = run_cruel_audit()
    print(json.dumps(result, indent=2, ensure_ascii=False))
