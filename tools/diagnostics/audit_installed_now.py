import ftplib
import io
import sqlite3
import json

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121, timeout=10)
ftp.login()

def list_items(path):
    lines = []
    try:
        ftp.retrlines(f'LIST {path}', lines.append)
        items = []
        for l in lines:
            parts = l.split()
            if len(parts) >= 9 and parts[-1] not in ('.', '..'):
                items.append((parts[0].startswith('d'), parts[-1], parts[4]))
        return items
    except Exception as e:
        return [('err', str(e), 0)]

print("=== 1. JUEGOS EN /user/app ===")
apps = list_items('/user/app')
for is_d, name, sz in apps:
    print(f"  [APP] {name}")

print("\n=== 2. PARCHES EN /user/patch ===")
patches = list_items('/user/patch')
for is_d, name, sz in patches:
    print(f"  [PATCH] {name}")

print("\n=== 3. DLCs EN /user/addcont ===")
addconts = list_items('/user/addcont')
for is_d, name, sz in addconts:
    sub_dlcs = list_items(f'/user/addcont/{name}')
    print(f"  [DLC] {name}: {len(sub_dlcs)} items")
    for _, sname, _ in sub_dlcs:
        print(f"     -> {sname}")

print("\n=== 4. ESTADO ESPECIFICO DE GOW CUSA07408 ===")
gow_app = list_items('/user/app/CUSA07408')
print(f"  /user/app/CUSA07408: {len(gow_app)} items")
gow_patch = list_items('/user/patch/CUSA07408')
print(f"  /user/patch/CUSA07408: {len(gow_patch)} items ({gow_patch})")
gow_playgo = list_items('/user/playgo/patch/UP9000-CUSA07408_00-00000000GODOFWAR')
print(f"  /user/playgo/patch/UP9000-CUSA07408_00-00000000GODOFWAR: {gow_playgo}")

bio = io.BytesIO()
ftp.retrbinary('RETR /system_data/priv/mms/app.db', bio.write)
ftp.quit()

conn = sqlite3.connect(':memory:')
conn.deserialize(bio.getvalue())
c = conn.cursor()

print("\n=== 5. ENTRADA CUSA07408 EN app.db ===")
row = c.execute("SELECT titleId, titleName, pathInfo, installTime, AppInfoJson FROM tbl_contentinfo WHERE titleId = 'CUSA07408'").fetchone()
if row:
    print("  titleId:", row[0])
    print("  titleName:", row[1])
    print("  pathInfo:", row[2])
    print("  installTime:", row[3])
    if row[4]:
        try:
            info = json.loads(row[4])
            print("  AppInfoJson:", json.dumps(info, indent=2))
        except Exception:
            print("  AppInfoJson raw:", str(row[4])[:200])

# Also check other tables in app.db for CUSA07408
for t in ['tbl_conceptmetadata', 'tbl_info_0482932290']:
    try:
        r2 = c.execute(f"SELECT * FROM {t} WHERE rowid > 0").fetchall()
        for r in r2:
            if 'CUSA07408' in str(r):
                print(f"  [{t}] {r}")
    except Exception:
        pass
