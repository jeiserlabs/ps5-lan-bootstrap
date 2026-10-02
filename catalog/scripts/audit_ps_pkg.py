import os
import sys
import struct
import glob

def parse_sfo(sfo_data):
    if sfo_data[:4] != b'\x00PSF':
        return {}
    key_table_start, data_table_start, count = struct.unpack('<III', sfo_data[8:20])
    entries = {}
    for i in range(count):
        koff, param_fmt, param_len, param_max_len, doff = struct.unpack('<HHIII', sfo_data[20+i*16:20+(i+1)*16])
        key = sfo_data[key_table_start + koff:].split(b'\x00')[0].decode('latin1')
        val = sfo_data[data_table_start + doff:data_table_start + doff + param_len]
        if param_fmt in (0x0204, 0x0004):
            val = val.rstrip(b'\x00').decode('utf-8', errors='ignore')
        elif param_fmt == 0x0404:
            val = struct.unpack('<I', val)[0]
        entries[key] = val
    return entries

def inspect_pkg(pkg_path):
    if not os.path.exists(pkg_path):
        return {'status': 'NOT_FOUND', 'file': pkg_path}
    size = os.path.getsize(pkg_path)
    if size < 0x2000:
        return {'status': 'TRUNCATED', 'file': pkg_path, 'size': size}
    
    with open(pkg_path, 'rb') as f:
        magic = f.read(4)
        if magic != b'\x7fCNT':
            return {'status': 'INVALID_MAGIC', 'file': pkg_path, 'size': size, 'magic': str(magic)}
        
        f.seek(0x10)
        entry_count = struct.unpack('>I', f.read(4))[0]
        f.seek(0x18)
        table_offset = struct.unpack('>I', f.read(4))[0]
        f.seek(0x40)
        content_id = f.read(36).decode('latin1', errors='ignore').rstrip('\x00')
        
        f.seek(table_offset)
        sfo_offset = None
        sfo_size = None
        for _ in range(entry_count):
            entry_id, filename_offset, flags1, flags2, offset, entry_sz, pad = struct.unpack('>IIIIIIQ', f.read(32))
            if entry_id == 0x1000: # param.sfo
                sfo_offset = offset
                sfo_size = entry_sz
                break
        
        sfo = {}
        if sfo_offset:
            f.seek(sfo_offset)
            sfo = parse_sfo(f.read(sfo_size))
        
        return {
            'status': 'OK',
            'file': pkg_path,
            'filename': os.path.basename(pkg_path),
            'size': size,
            'content_id': content_id,
            'title_id': sfo.get('TITLE_ID', 'UNKNOWN'),
            'title': sfo.get('TITLE', 'UNKNOWN'),
            'app_ver': sfo.get('APP_VER', '1.00'),
            'version': sfo.get('VERSION', '1.00'),
            'category': sfo.get('CATEGORY', 'UNKNOWN') # gd=Game, gp=Patch, ac=DLC
        }

def audit_target(target_path):
    if os.path.isfile(target_path):
        pkgs = [target_path] if target_path.lower().endswith('.pkg') else []
    else:
        pkgs = glob.glob(os.path.join(target_path, '**', '*.pkg'), recursive=True)
    
    if not pkgs:
        return {'target': target_path, 'pkgs': [], 'verdict': 'SIN_PKGS'}
    
    results = [inspect_pkg(p) for p in pkgs]
    
    # Categorize
    bases = [r for r in results if r['status'] == 'OK' and r.get('category') == 'gd']
    patches = [r for r in results if r['status'] == 'OK' and r.get('category') == 'gp']
    dlcs = [r for r in results if r['status'] == 'OK' and r.get('category') == 'ac']
    corrupts = [r for r in results if r['status'] != 'OK']
    
    total_size = sum(r['size'] for r in results if 'size' in r)
    
    # Check compatibility
    title_ids = set(r.get('title_id') for r in results if 'title_id' in r and r['title_id'] != 'UNKNOWN')
    content_ids = set(r.get('content_id') for r in results if 'content_id' in r)
    
    verdict = 'LISTO'
    reasons = []
    
    if corrupts:
        verdict = 'ERROR_CORRUPTO'
        reasons.append(f"{len(corrupts)} archivo(s) corrupto(s)")
    elif not bases and (patches or dlcs):
        verdict = 'INCOMPLETO_FALTA_BASE'
        reasons.append("Tiene parche/DLC pero falta el PKG del juego base")
    elif len(title_ids) > 1:
        verdict = 'INCOMPATIBLE_TITLES'
        reasons.append(f"Múltiples Title IDs detectados: {title_ids}")
    
    return {
        'target': target_path,
        'title': bases[0].get('title') if bases else (patches[0].get('title') if patches else 'Desconocido'),
        'title_id': list(title_ids)[0] if len(title_ids) == 1 else list(title_ids),
        'bases_count': len(bases),
        'patches_count': len(patches),
        'dlcs_count': len(dlcs),
        'total_size_gb': round(total_size / (1024**3), 2),
        'fits_d_32gb': (total_size <= 30989352960),
        'fits_f_64gb': (total_size <= 63328092160),
        'verdict': verdict,
        'reasons': reasons,
        'details': results
    }

if __name__ == '__main__':
    targets = sys.argv[1:]
    if not targets:
        targets = [
            r'C:\Users\dev\Desktop\Call of Duty Black Ops',
            r'C:\Users\dev\Desktop\Call of Duty Black Ops 2',
            r'C:\Users\dev\Desktop\EA SPORTS FC 27',
            r'C:\Users\dev\Desktop\Horizon Forbidden West',
            r'C:\Users\dev\Desktop\It Takes Two',
            r'C:\Users\dev\Desktop\Tekken 7 Ultimate Edition',
            r'C:\Users\dev\Desktop\MLB.The.Show.24_CUSA43942_v1.21_[11.00]_OPOISSO893.pkg',
            r'E:\Biblioteca_Juegos_PS\Crash Team Racing Nitro Fueled (CUSA13795)',
            r'E:\Biblioteca_Juegos_PS\Horizon Zero Dawn Complete Edition',
            r'E:\Biblioteca_Juegos_PS\MLB The Show 24'
        ]
    
    print("="*80)
    print(" AUDITORÍA MAESTRA DE JUEGOS PS4/PS5 (INTEGRIDAD, COMPLETITUD, COMPATIBILIDAD)")
    print("="*80)
    
    for t in targets:
        if not os.path.exists(t):
            continue
        res = audit_target(t)
        v = res['verdict']
        v_icon = "✅ LISTO" if v == 'LISTO' else ("⚠️ INCOMPLETO" if "INCOMPLETO" in v else "❌ " + v)
        print(f"\n📂 {os.path.basename(t)}")
        print(f"   Título: {res['title']} | ID: {res['title_id']}")
        print(f"   Composición: {res['bases_count']} Base, {res['patches_count']} Patch, {res['dlcs_count']} DLCs | Tamaño: {res['total_size_gb']} GB")
        print(f"   Capacidad: Cabe en Kingston D (32GB): {'SÍ' if res['fits_d_32gb'] else 'NO'} | Cabe en ASolid F (64GB): {'SÍ' if res['fits_f_64gb'] else 'NO'}")
        print(f"   Veredicto: {v_icon}")
        if res['reasons']:
            for r in res['reasons']:
                print(f"   -> Razón: {r}")
