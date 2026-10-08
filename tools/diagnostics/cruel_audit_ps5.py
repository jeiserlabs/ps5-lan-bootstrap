import ftplib
import io
import sqlite3
import json
import urllib.request
import time

PS5_IP = "192.168.2.2"
FTP_PORT = 2121

WHITELIST_GAMES = {
    "CUSA02299", "CUSA07995", "CUSA10213", "CUSA13323", "CUSA13795",
    "CUSA16742", "CUSA17776", "CUSA23384", "CUSA28561", "CUSA43942"
}
WHITELIST_HOMEBREW = {
    "PLDM00001", "NPXS40172", "WKAL00001", "FAKE10101",
    "SLUG51851", "NPXS39041", "ITEM00001", "PKGS12800", "ETHN13600"
}
ALL_WHITELIST = WHITELIST_GAMES.union(WHITELIST_HOMEBREW)

ftp = ftplib.FTP()
ftp.connect(PS5_IP, FTP_PORT, timeout=10)
ftp.login()

def get_listing(path):
    lines = []
    try:
        ftp.retrlines(f"LIST {path}", lines.append)
        items = []
        for l in lines:
            parts = l.split()
            if len(parts) >= 9 and parts[-1] not in (".", ".."):
                is_dir = parts[0].startswith("d")
                size = int(parts[4]) if not is_dir else 0
                items.append((is_dir, parts[-1], size, parts[0]))
        return items
    except Exception:
        return []

def get_dir_size_and_count(path, depth=0, max_depth=5):
    total_sz = 0
    total_files = 0
    items = get_listing(path)
    for is_d, name, sz, _ in items:
        if is_d:
            if depth < max_depth:
                s, f = get_dir_size_and_count(f"{path}/{name}", depth + 1, max_depth)
                total_sz += s
                total_files += f
        else:
            total_sz += sz
            total_files += 1
    return total_sz, total_files

print("================================================================================")
print("             CRUEL FORENSIC AUDIT LOOP - PS5 13.40 SLIM (END-TO-END)           ")
print("================================================================================")

# 1. AUDITORÍA DE /user/app
print("\n[1] AUDITORÍA DE APLICACIONES Y JUEGOS (/user/app)")
app_items = get_listing("/user/app")
unknown_apps = []
installed_apps = []
for is_d, name, _, _ in app_items:
    if name in ALL_WHITELIST:
        installed_apps.append(name)
    else:
        unknown_apps.append(name)
print(f"  Total apps en /user/app: {len(app_items)}")
print(f"  Apps reconocidas ({len(installed_apps)}): {', '.join(sorted(installed_apps))}")
if unknown_apps:
    print(f"  [!] APPS DESCONOCIDAS/HUÉRFANAS: {unknown_apps}")
else:
    print("  [OK] Cero apps huérfanas o desconocidas en /user/app.")

# 2. AUDITORÍA DE /user/patch
print("\n[2] AUDITORÍA DE PARCHES (/user/patch)")
patch_items = get_listing("/user/patch")
orphan_patches = []
valid_patches = []
for is_d, name, _, _ in patch_items:
    if name in WHITELIST_GAMES:
        valid_patches.append(name)
    else:
        orphan_patches.append(name)
print(f"  Total parches instalados: {len(patch_items)}")
print(f"  Parches válidos ({len(valid_patches)}): {', '.join(sorted(valid_patches))}")
if orphan_patches:
    print(f"  [!] PARCHES HUÉRFANOS: {orphan_patches}")
else:
    print("  [OK] Cero parches huérfanos en /user/patch.")

# 3. AUDITORÍA DE /user/addcont (DLCs)
print("\n[3] AUDITORÍA DE COMPLEMENTOS Y DLCS (/user/addcont)")
addcont_items = get_listing("/user/addcont")
orphan_addconts = []
valid_addconts = []
for is_d, name, _, _ in addcont_items:
    if name in WHITELIST_GAMES:
        sub = get_listing(f"/user/addcont/{name}")
        valid_addconts.append(f"{name} ({len(sub)} DLCs)")
    else:
        orphan_addconts.append(name)
print(f"  Total carpetas DLC: {len(addcont_items)}")
print(f"  DLCs válidos: {', '.join(valid_addconts)}")
if orphan_addconts:
    print(f"  [!] DLCS HUÉRFANOS: {orphan_addconts}")
else:
    print("  [OK] Cero DLCs huérfanos en /user/addcont.")

# 4. AUDITORÍA DE STAGING, TEMPORALES Y BASURA
print("\n[4] AUDITORÍA DE CARPETAS DE STAGING Y TEMPORALES")
temp_targets = [
    "/user/download",
    "/user/bgft",
    "/user/temp",
    "/user/lost+found",
    "/data/homebrew",
    "/data/pkgmgr",
    "/user/playgo/patch",
    "/system_tmp"
]
junk_found = []
for target in temp_targets:
    items = get_listing(target)
    # Filter out system sockets in system_tmp
    real_items = [i for i in items if not (target == "/system_tmp" and i[1].endswith(".sock"))]
    if real_items:
        junk_found.append((target, len(real_items)))
        print(f"  [!] {target}: Contiene {len(real_items)} elementos residuales")
        for is_d, n, sz, _ in real_items[:3]:
            print(f"      - {n} ({sz} bytes)")
    else:
        print(f"  [OK] {target}: 0 elementos (Limpio)")

# 5. AUDITORÍA DE BASES DE DATOS DEL SISTEMA
print("\n[5] AUDITORÍA FORENSE DE BASES DE DATOS (bgft.db & app.db)")
# bgft.db
bio_bgft = io.BytesIO()
try:
    ftp.retrbinary("RETR /system_data/priv/mms/bgft.db", bio_bgft.write)
    conn_b = sqlite3.connect(":memory:")
    conn_b.deserialize(bio_bgft.getvalue())
    cb = conn_b.cursor()
    dl_count = cb.execute("SELECT count(*) FROM tbl_downloads").fetchone()[0]
    sec_count = cb.execute("SELECT count(*) FROM tbl_section").fetchone()[0]
    print(f"  bgft.db tbl_downloads (tareas activas): {dl_count} registros")
    print(f"  bgft.db tbl_section (secciones activas): {sec_count} registros")
    if dl_count == 0 and sec_count == 0:
        print("  [OK] bgft.db 100% libre de tareas atascadas.")
    else:
        print("  [!] bgft.db contiene registros pendientes.")
    conn_b.close()
except Exception as e:
    print(f"  [-] Error leyendo bgft.db: {e}")

# app.db
bio_app = io.BytesIO()
try:
    ftp.retrbinary("RETR /system_data/priv/mms/app.db", bio_app.write)
    conn_a = sqlite3.connect(":memory:")
    conn_a.deserialize(bio_app.getvalue())
    ca = conn_a.cursor()
    # Check for GOW remnants
    gow_rows = ca.execute("SELECT titleId, titleName FROM tbl_contentinfo WHERE titleId = 'CUSA07408'").fetchall()
    if gow_rows:
        print(f"  [!] app.db todavía tiene registro de GOW: {gow_rows}")
    else:
        print("  [OK] app.db: Cero residuos de CUSA07408 (GOW dañado removido).")
    conn_a.close()
except Exception as e:
    print(f"  [-] Error leyendo app.db: {e}")

# 6. CONFIGURACIÓN DEL AUTOLOADER (:8084)
print("\n[6] AUDITORÍA DE CONFIGURACIÓN DEL AUTOLOADER (:8084)")
try:
    with urllib.request.urlopen(f"http://{PS5_IP}:8084/get_config", timeout=3) as resp:
        cfg = json.loads(resp.read().decode())
        chain = cfg.get("AUTOLOAD_LIST", "")
        print(f"  Cadena activa: {chain}")
        if "shadowmount" in chain.lower():
            print("  [!] ShadowMount SIGUE en la cadena.")
        else:
            print("  [OK] ShadowMount NO está en la cadena de autocarga.")
except Exception as e:
    print(f"  [-] Error leyendo 8084: {e}")

# 7. BALANCE GENERAL DE ESPACIO DE ALMACENAMIENTO
print("\n[7] BALANCE GENERAL DE ALMACENAMIENTO (DISCO PS5)")
try:
    with urllib.request.urlopen(f"http://{PS5_IP}:12800/api/space", timeout=3) as resp:
        sp = json.loads(resp.read().decode())
        free_gb = sp.get("free", 0) / (1024**3)
        total_gb = sp.get("total", 0) / (1024**3)
        used_gb = total_gb - free_gb
        print(f"  Espacio Libre  : {free_gb:.2f} GB")
        print(f"  Espacio Usado  : {used_gb:.2f} GB")
        print(f"  Espacio Total  : {total_gb:.2f} GB")
except Exception as e:
    print(f"  [-] Error leyendo /api/space: {e}")

ftp.quit()
print("\n================================================================================")
print("                          FIN DE AUDITORÍA FORENSE                             ")
print("================================================================================")
