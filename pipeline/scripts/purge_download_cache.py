#!/usr/bin/env python3
"""
Purge residual / orphan files in PS5 /user/download/
Recovers ~20.9 GB of SSD storage safely via FTP.
"""
import sys
import ftplib

PS5_IP = "192.168.2.2"
FTP_PORT = 2121
TARGET_DIRS = [
    "/user/download/CUSA28561",
    "/user/addcont/CUSA00900/SPEXPANSIONDLC03",
    "/user/addcont/CUSA00900"
]

def parse_list(lines):
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

def list_items(ftp, path):
    lines = []
    try:
        ftp.retrlines(f"LIST {path}", lines.append)
    except Exception as e:
        return []
    return parse_list(lines)

def purge():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except:
        pass

    print(f"[*] Conectando a PS5 FTP {PS5_IP}:{FTP_PORT}...")
    ftp = ftplib.FTP()
    ftp.connect(PS5_IP, FTP_PORT, timeout=10)
    ftp.login()
    print("[+] Conectado OK.")

    total_freed = 0
    deleted_files = 0
    deleted_dirs = 0

    for d in TARGET_DIRS:
        print(f"\n[*] Procesando directorio: {d}")
        items = list_items(ftp, d)
        if not items:
            print(f"  [i] Directorio vacío o inexistente: {d}")
            try:
                ftp.rmd(d)
                print(f"  [+] Directorio eliminado: {d}")
                deleted_dirs += 1
            except Exception as e:
                print(f"  [-] No se pudo eliminar directorio {d}: {e}")
            continue

        for item in items:
            filepath = f"{d}/{item['name']}"
            if not item['is_dir']:
                try:
                    ftp.delete(filepath)
                    total_freed += item['size']
                    deleted_files += 1
                    print(f"  [-] Borrado: {filepath} ({item['size'] / (1024**2):.2f} MB)")
                except Exception as e:
                    print(f"  [!] Error borrando {filepath}: {e}")
            else:
                print(f"  [?] Subcarpeta inesperada detectada: {filepath}, omitiendo.")

        # Try to delete directory after emptying
        try:
            ftp.rmd(d)
            deleted_dirs += 1
            print(f"  [+] Directorio padre eliminado: {d}")
        except Exception as e:
            print(f"  [!] No se pudo eliminar directorio padre {d}: {e}")

    print("\n" + "=" * 50)
    print(f"RESUMEN PURGA:")
    print(f"  Archivos borrados: {deleted_files}")
    print(f"  Directorios borrados: {deleted_dirs}")
    print(f"  Espacio liberado: {total_freed / (1024**3):.2f} GB ({total_freed:,} bytes)")

    # Verify /user/download state
    remaining = list_items(ftp, "/user/download")
    print(f"  Estado /user/download tras purga: {[r['name'] for r in remaining] or '100% LIMPIO'}")
    print("=" * 50)

    ftp.quit()

if __name__ == "__main__":
    purge()
