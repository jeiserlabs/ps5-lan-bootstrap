import ftplib
import io
import struct

def parse_sfo(data):
    try:
        magic, version, key_table_start, data_table_start, num_entries = struct.unpack('<4sIIII', data[:20])
        if magic != b'\x00PSF':
            return {}
        entries = []
        for i in range(num_entries):
            offset = 20 + i * 16
            key_off, param_fmt, param_len, param_max_len, data_off = struct.unpack('<HHIII', data[offset:offset+16])
            entries.append((key_off, param_fmt, param_len, data_off))
        
        result = {}
        for key_off, param_fmt, param_len, data_off in entries:
            key_end = data.find(b'\x00', key_table_start + key_off)
            key = data[key_table_start + key_off:key_end].decode('utf-8', 'ignore')
            val_data = data[data_table_start + data_off:data_table_start + data_off + param_len]
            if param_fmt in (0x0004, 0x0204):
                val = val_data.rstrip(b'\x00').decode('utf-8', 'ignore')
            elif param_fmt == 0x0404:
                val = struct.unpack('<I', val_data)[0]
            else:
                val = val_data
            result[key] = val
        return result
    except Exception as e:
        return {'error': str(e)}

def main():
    ftp = ftplib.FTP()
    ftp.connect('192.168.2.2', 2121, timeout=5)
    ftp.login()
    
    # 1. Check /user/app
    app_dirs = []
    ftp.retrlines('LIST /user/app', lambda line: app_dirs.append(line.split()[-1]))
    
    print("=== JUEGOS Y APPS EN /user/app ===")
    app_titles = []
    for d in app_dirs:
        if d in ('.', '..'): continue
        sfo_buf = io.BytesIO()
        try:
            ftp.retrbinary(f'RETR /user/app/{d}/sce_sys/param.sfo', sfo_buf.write)
            sfo = parse_sfo(sfo_buf.getvalue())
            title = sfo.get('TITLE', 'Desconocido')
            ver = sfo.get('APP_VER', sfo.get('VERSION', 'N/A'))
            cat = sfo.get('CATEGORY', 'N/A')
            tid = sfo.get('TITLE_ID', d)
            print(f"- [{tid}] {title} | Ver: {ver} | Cat: {cat} (Dir: {d})")
            app_titles.append((tid, title, ver, cat))
        except Exception as e:
            print(f"- [{d}] (Sin param.sfo / Error: {e})")

    # 2. Check /user/patch
    print("\n=== UPDATES / PATCHES EN /user/patch ===")
    patch_dirs = []
    try:
        ftp.retrlines('LIST /user/patch', lambda line: patch_dirs.append(line.split()[-1]))
        for d in patch_dirs:
            if d in ('.', '..'): continue
            sfo_buf = io.BytesIO()
            try:
                ftp.retrbinary(f'RETR /user/patch/{d}/sce_sys/param.sfo', sfo_buf.write)
                sfo = parse_sfo(sfo_buf.getvalue())
                title = sfo.get('TITLE', 'Desconocido')
                ver = sfo.get('APP_VER', sfo.get('VERSION', 'N/A'))
                tid = sfo.get('TITLE_ID', d)
                print(f"- [{tid}] {title} | Update Ver: {ver} (Dir: {d})")
            except Exception as e:
                print(f"- [{d}] (Sin param.sfo / Error: {e})")
    except Exception as e:
        print("Error listing /user/patch:", e)

    # 3. Check /user/addcont (DLCs)
    print("\n=== DLCs EN /user/addcont ===")
    try:
        addcont_dirs = []
        ftp.retrlines('LIST /user/addcont', lambda line: addcont_dirs.append(line.split()[-1]))
        for d in addcont_dirs:
            if d in ('.', '..'): continue
            subdirs = []
            ftp.retrlines(f'LIST /user/addcont/{d}', lambda line: subdirs.append(line.split()[-1]))
            sub_clean = [s for s in subdirs if s not in ('.', '..')]
            print(f"- [{d}] DLCs instalados ({len(sub_clean)}): {', '.join(sub_clean)}")
    except Exception as e:
        print("Error listing /user/addcont:", e)

    ftp.quit()

if __name__ == '__main__':
    main()
