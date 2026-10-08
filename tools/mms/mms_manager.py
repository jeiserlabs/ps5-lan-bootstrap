import os
import io
import sqlite3
import argparse
from ftplib import FTP

PS5_IP = '192.168.2.2'
FTP_PORT = 2121
MMS_REMOTE_DIR = '/system_data/priv/mms'
BACKUP_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'backups', 'mms_golden')

MMS_FILES = ['app.db', 'appinfo.db', 'addcont.db', 'notification2.db', 'bgft.db']

def connect_ftp():
    ftp = FTP()
    ftp.connect(PS5_IP, FTP_PORT, timeout=10)
    ftp.login()
    return ftp

def backup_mms():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    print(f'[*] Respaldando bases de datos de {MMS_REMOTE_DIR} -> {BACKUP_DIR}')
    for fname in MMS_FILES:
        local_path = os.path.join(BACKUP_DIR, fname)
        try:
            ftp = connect_ftp()
            ftp.cwd(MMS_REMOTE_DIR)
            with open(local_path, 'wb') as f:
                ftp.retrbinary(f'RETR {fname}', f.write)
            ftp.quit()
            print(f'  [+] {fname} respaldado ({os.path.getsize(local_path)} bytes)')
        except Exception as e:
            print(f'  [-] Error respaldando {fname}: {e}')
    print('[OK] Respaldo maestro completado.')

def vacuum_mms():
    print('[*] Descargando y optimizando bases de datos SQLite...')
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ftp = connect_ftp()
    ftp.cwd(MMS_REMOTE_DIR)
    for fname in ['app.db', 'appinfo.db']:
        local_path = os.path.join(BACKUP_DIR, f'opt_{fname}')
        with open(local_path, 'wb') as f:
            ftp.retrbinary(f'RETR {fname}', f.write)
        
        orig_sz = os.path.getsize(local_path)
        conn = sqlite3.connect(local_path)
        c = conn.cursor()
        check = c.execute('PRAGMA integrity_check').fetchone()[0]
        if check != 'ok':
            print(f'  [!] ALERTA: {fname} integridad comprometida: {check}')
            conn.close()
            continue
        c.execute('VACUUM')
        conn.commit()
        conn.close()
        new_sz = os.path.getsize(local_path)
        print(f'  [+] {fname} verificado OK y compactado: {orig_sz} -> {new_sz} bytes (-{orig_sz-new_sz} bytes)')
        
        # Subir version compactada de vuelta
        with open(local_path, 'rb') as f:
            ftp.storbinary(f'STOR {fname}', f)
        print(f'  [+] {fname} optimizado subido a PS5 con exito.')
    ftp.quit()
    print('[OK] Optimizacion SQLite completada.')

def restore_mms():
    print(f'[*] Restaurando bases de datos desde {BACKUP_DIR} -> PS5')
    if not os.path.exists(BACKUP_DIR):
        print('[-] Error: No existe carpeta de respaldo.')
        return
    for fname in MMS_FILES:
        local_path = os.path.join(BACKUP_DIR, fname)
        if not os.path.exists(local_path) or os.path.getsize(local_path) == 0:
            continue
        try:
            ftp = connect_ftp()
            ftp.cwd(MMS_REMOTE_DIR)
            with open(local_path, 'rb') as f:
                ftp.storbinary(f'STOR {fname}', f)
            ftp.quit()
            print(f'  [+] {fname} restaurado en PS5 ({os.path.getsize(local_path)} bytes)')
        except Exception as e:
            print(f'  [-] Error restaurando {fname}: {e}')
    print('[OK] Restauracion completada. Reiniciar PS5 para aplicar.')

def purge_junk():
    ftp = connect_ftp()
    print('[*] Purgando basura identificada en disco...')
    junk_files = [
        '/user/data/pkgs/YouTube.app.PPSA01650.version.USA.01.000.030.pkg'
    ]
    for jf in junk_files:
        try:
            resp = ftp.delete(jf)
            print(f'  [+] Eliminado: {jf}')
        except Exception as e:
            if '226' in str(e) or 'deleted' in str(e).lower():
                print(f'  [+] Eliminado: {jf}')
            else:
                print(f'  [-] Info sobre {jf}: {e}')
    ftp.quit()
    print('[OK] Limpieza de basura completada.')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='PS5 MMS Database Manager & Scene Cleaner')
    parser.add_argument('action', choices=['backup', 'vacuum', 'restore', 'purge'], help='Accion a ejecutar')
    args = parser.parse_args()
    
    if args.action == 'backup':
        backup_mms()
    elif args.action == 'vacuum':
        vacuum_mms()
    elif args.action == 'restore':
        restore_mms()
    elif args.action == 'purge':
        purge_junk()
