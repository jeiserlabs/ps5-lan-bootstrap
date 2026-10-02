import struct
import os
import glob
import sys

def parse_sfo(sfo_data):
    if len(sfo_data) < 20 or sfo_data[:4] != b'\x00PSF':
        return {}
    try:
        magic, version, key_table_start, data_table_start, count = struct.unpack('<4sIIII', sfo_data[:20])
        entries = {}
        for i in range(count):
            offset = 20 + i * 16
            koff, param_fmt, param_len, param_max_len, doff = struct.unpack('<HHIII', sfo_data[offset:offset+16])
            key = sfo_data[key_table_start + koff:].split(b'\x00')[0].decode('latin1')
            val_bytes = sfo_data[data_table_start + doff:data_table_start + doff + param_len]
            if param_fmt in (0x0204, 0x0004):
                val = val_bytes.rstrip(b'\x00').decode('utf-8', errors='ignore')
            elif param_fmt == 0x0404 and len(val_bytes) >= 4:
                val = struct.unpack('<I', val_bytes[:4])[0]
            else:
                val = val_bytes
            entries[key] = val
        return entries
    except Exception as e:
        return {'_error': str(e)}

def verify_pkg(pkg_path):
    filename = os.path.basename(pkg_path)
    if not os.path.exists(pkg_path):
        return {'file': filename, 'verdict': 'NOT_FOUND'}
    
    actual_sz = os.path.getsize(pkg_path)
    if actual_sz < 0x2000:
        return {'file': filename, 'verdict': 'CORRUPT_TOO_SMALL', 'actual_sz': actual_sz}
        
    try:
        with open(pkg_path, 'rb') as f:
            magic = f.read(4)
            if magic != b'\x7fCNT':
                return {'file': filename, 'verdict': 'INVALID_MAGIC', 'actual_sz': actual_sz}
            
            f.seek(0x40)
            content_id = f.read(36).decode('latin1', errors='ignore').rstrip('\x00')
            
            f.seek(0x418)
            header_sz = struct.unpack('>Q', f.read(8))[0]
            body_off = struct.unpack('>Q', f.read(8))[0]
            body_sz = struct.unpack('>Q', f.read(8))[0]
            
            # Check size integrity: header declares unpadded size
            # If actual size is strictly less than header_sz, the file was truncated during download!
            if actual_sz < header_sz:
                return {
                    'file': filename,
                    'path': pkg_path,
                    'content_id': content_id,
                    'verdict': 'TRUNCATED_INCOMPLETE',
                    'actual_sz_gb': round(actual_sz / (1024**3), 2),
                    'header_sz_gb': round(header_sz / (1024**3), 2),
                    'missing_gb': round((header_sz - actual_sz) / (1024**3), 2)
                }
            
            # Check EOF readability
            f.seek(actual_sz - min(actual_sz, 1024*1024))
            tail = f.read()
            if len(tail) == 0:
                return {'file': filename, 'verdict': 'EOF_READ_FAILED'}
            
            # Parse param.sfo
            f.seek(0x10)
            entry_count = struct.unpack('>I', f.read(4))[0]
            f.seek(0x18)
            table_offset = struct.unpack('>I', f.read(4))[0]
            
            sfo_off = None
            sfo_sz = None
            f.seek(table_offset)
            for _ in range(entry_count):
                eid, _, _, _, off, sz, _ = struct.unpack('>IIIIIIQ', f.read(32))
                if eid == 0x1000:
                    sfo_off = off
                    sfo_sz = sz
                    break
            
            sfo_title = 'UNKNOWN'
            sfo_cat = 'UNKNOWN'
            sfo_ver = '1.00'
            sfo_tid = 'UNKNOWN'
            if sfo_off and sfo_sz:
                f.seek(sfo_off)
                sfo = parse_sfo(f.read(sfo_sz))
                sfo_title = sfo.get('TITLE', 'UNKNOWN')
                sfo_cat = sfo.get('CATEGORY', 'UNKNOWN')
                sfo_ver = sfo.get('APP_VER', sfo.get('VERSION', '1.00'))
                sfo_tid = sfo.get('TITLE_ID', 'UNKNOWN')

            # Category labels
            cat_name = 'BASE' if sfo_cat == 'gd' else ('UPDATE' if sfo_cat == 'gp' else ('DLC' if sfo_cat == 'ac' else sfo_cat))

            return {
                'file': filename,
                'path': pkg_path,
                'verdict': 'VALID_COMPLETE',
                'title': sfo_title,
                'title_id': sfo_tid,
                'category': cat_name,
                'raw_category': sfo_cat,
                'version': sfo_ver,
                'content_id': content_id,
                'actual_sz_gb': round(actual_sz / (1024**3), 2),
                'header_sz_gb': round(header_sz / (1024**3), 2)
            }
    except Exception as e:
        return {'file': filename, 'verdict': 'ERROR_EXCEPTION', 'error': str(e)}

def run_audit(directories):
    all_results = []
    for d in directories:
        if not os.path.exists(d):
            continue
        print(f"\n========================================================")
        print(f" 🔍 AUDITANDO DIRECTORIO: {d}")
        print(f"========================================================")
        pkgs = glob.glob(os.path.join(d, '**', '*.pkg'), recursive=True)
        if not pkgs:
            print("  (No se encontraron archivos .pkg)")
            continue
        for p in pkgs:
            res = verify_pkg(p)
            all_results.append(res)
            v = res['verdict']
            if v == 'VALID_COMPLETE':
                print(f"✅ [OK] {res['actual_sz_gb']} GB | {res['category']} | {res['title_id']} v{res['version']} | {res['title']}")
                print(f"      Archivo: {res['file']}")
            elif v == 'TRUNCATED_INCOMPLETE':
                print(f"❌ [TRUNCADO / DESCARGA INCOMPLETA]: {res['file']}")
                print(f"      Tiene en disco: {res['actual_sz_gb']} GB")
                print(f"      Tamaño real requerido: {res['header_sz_gb']} GB")
                print(f"      FALTAN: {res['missing_gb']} GB (¡SI SE ENVÍA DARÁ ERROR!)")
            else:
                print(f"⚠️ [{v}] {res['file']}")
    return all_results

if __name__ == '__main__':
    targets = [
        r'C:\Biblioteca_Juegos_PS',
        r'E:\Biblioteca_Juegos_PS'
    ]
    run_audit(targets)
