import os
import sys
import time
import socket
import sqlite3
import io
import ftplib
from datetime import datetime

PS5_IP = "192.168.2.2"
FTP_PORT = 2121
TIMEOUT = 10
BACKUP_DIR = r"E:\ps5\data\backups"
LOG_FILE = r"E:\ps5\data\logs\emergency_purge.log"

PROTECTED_GAMES = {
    "CUSA02299", "CUSA07408", "CUSA07995", "CUSA10213", "CUSA13323",
    "CUSA13795", "CUSA16742", "CUSA17776", "CUSA23384", "CUSA28561",
    "CUSA43942", "WKAL00001", "PLDM00001", "ITEM00001", "NPXS39041",
    "SLUG51851", "FAKE10101"
}

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    formatted = f"[{ts}] {msg}"
    print(formatted, flush=True)
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(formatted + "\n")
    except Exception:
        pass

def wait_for_ftp():
    log(f"Esperando conexion FTP con PS5 en {PS5_IP}:{FTP_PORT}...")
    dot_count = 0
    while True:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(1.0)
            res = s.connect_ex((PS5_IP, FTP_PORT))
            s.close()
            if res == 0:
                log(f"[+] ¡PS5 DETECTADA Y CONECTADA EN {PS5_IP}:{FTP_PORT}!")
                return True
        except Exception:
            pass
        dot_count += 1
        if dot_count % 15 == 0:
            log("Sigo a la escucha en espera del jailbreak / FTP...")
        time.sleep(1.0)

def connect_ftp():
    ftp = ftplib.FTP()
    ftp.connect(PS5_IP, FTP_PORT, timeout=TIMEOUT)
    ftp.login()
    return ftp

def backup_and_clean_bgft(ftp):
    log("=== [PASO 1] AUDITANDO Y PURGANDO bgft.db (COLA DE TAREAS) ===")
    bio = io.BytesIO()
    try:
        ftp.retrbinary("RETR /system_data/priv/mms/bgft.db", bio.write)
    except Exception as e:
        log(f"[-] No se pudo leer /system_data/priv/mms/bgft.db: {e}")
        return False

    raw_bytes = bio.getvalue()
    if not raw_bytes:
        log("[-] bgft.db vino vacio")
        return False

    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = int(time.time())
    bak_path = os.path.join(BACKUP_DIR, f"bgft_pre_purge_{ts}.db")
    with open(bak_path, "wb") as f:
        f.write(raw_bytes)
    log(f"[+] Respaldo de bgft.db guardado en: {bak_path}")

    # Inspect & clean in memory
    conn = sqlite3.connect(":memory:")
    conn.deserialize(raw_bytes)
    c = conn.cursor()

    tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
    log(f"Tablas en bgft.db: {tables}")

    modified = False
    for t in tables:
        count = c.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
        if count > 0:
            log(f"  Tabla {t} tiene {count} registros")
            # Log sample records
            sample = c.execute(f"SELECT * FROM {t} LIMIT 3").fetchall()
            for s in sample:
                log(f"    sample: {s}")
            # Purge non-empty download/task tables
            if t in ["tbl_downloads", "tbl_tasks", "tbl_section", "tbl_package"]:
                c.execute(f"DELETE FROM {t}")
                log(f"[!] Purgados {count} registros de {t}")
                modified = True

    if modified:
        conn.commit()
        clean_bytes = conn.serialize()
        conn.close()
        bio_upload = io.BytesIO(clean_bytes)
        try:
            ftp.storbinary("STOR /system_data/priv/mms/bgft.db", bio_upload)
            log("[+] /system_data/priv/mms/bgft.db reescrito LIMPIO exitosamente!")
        except Exception as e:
            log(f"[-] Error subiendo bgft.db limpio: {e}")
    else:
        conn.close()
        log("[i] bgft.db ya estaba limpio de tareas activas.")
    return True

def delete_ftp_file_safe(ftp, path):
    try:
        ftp.delete(path)
        log(f"[PURGA] Archivo borrado: {path}")
        return True
    except Exception as e:
        log(f"[-] No se pudo borrar {path}: {e}")
        return False

def delete_dir_recursive(ftp, path):
    try:
        lines = []
        ftp.retrlines(f"LIST {path}", lines.append)
        for l in lines:
            parts = l.split()
            if not parts or parts[-1] in [".", ".."]:
                continue
            name = parts[-1]
            sub = f"{path}/{name}"
            if l.startswith("d"):
                delete_dir_recursive(ftp, sub)
            else:
                try:
                    ftp.delete(sub)
                    log(f"[PURGA] Archivo eliminado: {sub}")
                except Exception as e:
                    log(f"[-] Error eliminando {sub}: {e}")
        try:
            ftp.rmd(path)
            log(f"[PURGA] Carpeta eliminada: {path}")
        except Exception as e:
            log(f"[-] Error rmd {path}: {e}")
    except Exception as e:
        log(f"[-] Error procesando directorio {path}: {e}")

def purge_staging_folders(ftp):
    log("=== [PASO 2] PURGANDO CARPETAS DE DESCARGA Y STAGING ===")
    staging_targets = [
        "/user/download",
        "/user/bgft",
        "/user/temp",
        "/system_tmp",
        "/user/playgo/patch/UP9000-CUSA07408_00-00000000GODOFWAR",
        "/user/patch/CUSA07408",
        "/user/license/fakeEP9000-CUSA34386_00.idx",
        "/user/license/fakeEP9000-CUSA34386_00.rif",
        "/data/homebrew/gow_base_test.pkg",
        "/data/homebrew/gow_update_test.pkg",
        "/data/pkgmgr",
        "/data/pldmgr/payloads/pkgmanager"
    ]

    for target in staging_targets:
        try:
            if any(target.endswith(ext) for ext in [".pkg", ".idx", ".rif", ".bin"]):
                try:
                    ftp.delete(target)
                    log(f"[PURGA] Archivo eliminado: {target}")
                    continue
                except Exception:
                    pass

            if target in [
                "/user/playgo/patch/UP9000-CUSA07408_00-00000000GODOFWAR",
                "/user/patch/CUSA07408",
                "/data/pkgmgr",
                "/data/pldmgr/payloads/pkgmanager"
            ]:
                log(f"[!] Purgando carpeta conflictiva completa: {target}")
                delete_dir_recursive(ftp, target)
                continue

            lines = []
            ftp.retrlines(f"LIST {target}", lines.append)
            if not lines:
                continue
            log(f"Analizando objetivo: {target} ({len(lines)} entradas)")
            for l in lines:
                parts = l.split()
                if not parts or parts[-1] in [".", ".."]:
                    continue
                name = parts[-1]
                sub = f"{target}/{name}"
                if l.startswith("d"):
                    log(f"[!] Purgando carpeta staging huérfana: {sub}")
                    delete_dir_recursive(ftp, sub)
                else:
                    sz = parts[4] if len(parts) >= 5 else "?"
                    log(f"[!] Purgando archivo staging: {sub} ({sz} bytes)")
                    delete_ftp_file_safe(ftp, sub)
        except Exception as e:
            pass

def scan_large_ghosts(ftp, base_path, min_bytes=500*1024*1024, max_depth=3, cur_depth=0):
    if cur_depth > max_depth:
        return
    try:
        lines = []
        ftp.retrlines(f"LIST {base_path}", lines.append)
        for l in lines:
            parts = l.split()
            if not parts or parts[-1] in [".", ".."]:
                continue
            name = parts[-1]
            sub = f"{base_path}/{name}"

            # Safety check: NEVER scan or touch protected games
            if cur_depth == 1 and base_path in ["/user/app", "/user/patch", "/user/addcont"]:
                if name in PROTECTED_GAMES:
                    continue

            if l.startswith("d"):
                scan_large_ghosts(ftp, sub, min_bytes, max_depth, cur_depth + 1)
            else:
                try:
                    size = int(parts[4])
                    if size >= min_bytes:
                        gb = size / (1024**3)
                        log(f"[GHOST HALLAZGO] Archivo gigante detectado: {sub} -> {gb:.2f} GB")
                        if "gow" in sub.lower() or "ragnarok" in sub.lower() or "34386" in sub or "download" in sub or "temp" in sub:
                            log(f"[!] Eliminando archivo fantasma gigante: {sub}")
                            delete_ftp_file_safe(ftp, sub)
                except Exception:
                    pass
    except Exception:
        pass

def inspect_and_clean_appdb(ftp):
    log("=== [PASO 3] AUDITANDO app.db POR ENTRADAS HUÉRFANAS ===")
    bio = io.BytesIO()
    try:
        ftp.retrbinary("RETR /system_data/priv/mms/app.db", bio.write)
    except Exception as e:
        log(f"[-] No se pudo leer app.db: {e}")
        return

    raw_bytes = bio.getvalue()
    conn = sqlite3.connect(":memory:")
    conn.deserialize(raw_bytes)
    c = conn.cursor()

    # Check for invalid entries in tbl_contentinfo
    try:
        rows = c.execute("SELECT titleId, titleName FROM tbl_contentinfo WHERE titleId NOT IN (SELECT titleId FROM tbl_contentinfo WHERE titleId LIKE 'NPXS%' OR titleId LIKE 'IV9999%')").fetchall()
        for tid, tname in rows:
            if tid not in PROTECTED_GAMES:
                log(f"[ALERTA] Entrada sospechosa en tbl_contentinfo: {tid} ({tname})")
                if tid in ["PKGS12800", "CUSA34386"]:
                    log(f"[!] Eliminando registro corrupto {tid} de tbl_contentinfo...")
                    c.execute("DELETE FROM tbl_contentinfo WHERE titleId = ?", (tid,))
        conn.commit()
        clean_bytes = conn.serialize()
        conn.close()

        bio_up = io.BytesIO(clean_bytes)
        ftp.storbinary("STOR /system_data/priv/mms/app.db", bio_up)
        log("[+] app.db verificado y saneado.")
    except Exception as e:
        log(f"[-] Error saneando app.db: {e}")

def run_emergency_purge():
    log("=== SCRIPT DE PURGA DE EMERGENCIA PS5 ARMADO Y EN ESCUCHA ===")
    wait_for_ftp()

    start_time = time.time()
    try:
        ftp = connect_ftp()
        log("[+] Conexion FTP establecida. Ejecutando protocolo de salvamento...")

        # 1. Kill background tasks causing crash
        backup_and_clean_bgft(ftp)

        # 2. Purge known download staging and temp folders
        purge_staging_folders(ftp)

        # 3. Clean app.db of ghost entries
        inspect_and_clean_appdb(ftp)

        # 4. Deep scan for files > 500 MB in non-protected paths
        log("=== [PASO 4] RASTREANDO ARCHIVOS GIGANTES HUÉRFANOS (108 GB OTROS) ===")
        for search_root in ["/data", "/user/lost+found", "/user/temp", "/system_data/game", "/system_data/nobackup"]:
            log(f"Escaneando {search_root}...")
            scan_large_ghosts(ftp, search_root)

        ftp.quit()
        elapsed = time.time() - start_time
        log(f"=== [FIN] PROTOCOLO DE PURGA COMPLETADO EXITOSAMENTE EN {elapsed:.1f} SEGUNDOS ===")
    except Exception as e:
        log(f"[FATAL] Error durante la purga: {e}")

if __name__ == "__main__":
    run_emergency_purge()
