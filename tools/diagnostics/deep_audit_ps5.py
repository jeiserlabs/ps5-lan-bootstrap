import ftplib
import io
import struct

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121, timeout=10)
ftp.login()

def read_sfo(path):
    bio = io.BytesIO()
    try:
        ftp.retrbinary(f'RETR {path}', bio.write)
        data = bio.getvalue()
        if len(data) < 20 or data[:4] != b'\x00PSF':
            return {}
        # Parse SFO
        key_table_start, data_table_start, num_entries = struct.unpack('<III', data[8:20])
        entries = []
        for i in range(num_entries):
            k_off, fmt, d_len, d_max, d_off = struct.unpack('<HHIII', data[20+i*16:20+(i+1)*16])
            entries.append((k_off, fmt, d_len, d_off))
        result = {}
        for k_off, fmt, d_len, d_off in entries:
            key = data[key_table_start + k_off:].split(b'\x00', 1)[0].decode('utf-8', errors='ignore')
            val_bytes = data[data_table_start + d_off: data_table_start + d_off + d_len]
            if fmt == 0x0004:
                val = struct.unpack('<I', val_bytes)[0]
            elif fmt in (0x0204, 0x0404):
                val = val_bytes.rstrip(b'\x00').decode('utf-8', errors='ignore')
            else:
                val = val_bytes
            result[key] = val
        return result
    except Exception as e:
        return {}

def list_items(path):
    items = []
    try:
        ftp.retrlines(f'LIST {path}', lambda l: items.append(l.split()[-1]))
        return [i for i in items if i not in ('.', '..')]
    except Exception:
        return []

titles = [
    ('CUSA01967', 'Horizon Zero Dawn'),
    ('CUSA02299', "Marvel's Spider-Man"),
    ('CUSA06210', 'Naruto Shippuden UNS4 RTB'),
    ('CUSA07408', 'God of War (2018)'),
    ('CUSA08004', 'A Way Out'),
    ('CUSA10416', 'Unravel Two'),
    ('CUSA13323', 'Ghost of Tsushima'),
    ('CUSA13795', 'Crash Team Racing Nitro-Fueled'),
    ('CUSA16742', 'It Takes Two'),
    ('CUSA20499', 'Cuphead'),
    ('CUSA23384', 'Haven'),
    ('CUSA23464', 'Overcooked! All You Can Eat'),
    ('CUSA43942', 'MLB The Show 24'),
    ('CUSA57220', 'EA SPORTS FC 24/25')
]

print("==========================================================================================")
print("AUDITORÍA DE ESTADO DE COMPONENTES INSTALADOS EN PS5")
print("==========================================================================================")

for tid, name in titles:
    app_sfo = read_sfo(f'/user/app/{tid}/sce_sys/param.sfo')
    patch_sfo = read_sfo(f'/user/patch/{tid}/sce_sys/param.sfo')
    dlcs = list_items(f'/user/addcont/{tid}')
    
    app_ver = app_sfo.get('APP_VER', 'N/A')
    patch_ver = patch_sfo.get('APP_VER', 'N/A')
    
    active_ver = patch_ver if patch_ver != 'N/A' else app_ver
    
    print(f"\n🎮 [{tid}] {name}")
    print(f"   Base Ver: {app_ver} | Patch Ver: {patch_ver} -> Activa: v{active_ver}")
    print(f"   DLCs en PS5 ({len(dlcs)}): {dlcs if dlcs else 'Ninguno'}")

ftp.quit()
