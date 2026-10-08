import ftplib
import io
import sqlite3
import json
import socket
import time

PS5_IP = "192.168.2.2"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_for_ftp():
    log(f"Esperando a que enciendas la PS5 y cargues el jailbreak ({PS5_IP}:2121)...")
    while True:
        try:
            s = socket.socket()
            s.settimeout(1.0)
            res = s.connect_ex((PS5_IP, 2121))
            s.close()
            if res == 0:
                log("[+] ¡PS5 DETECTADA Y CONECTADA (FTP ABIERTO)!")
                return True
        except Exception:
            pass
        time.sleep(1.0)

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
                try: ftp.delete(sub)
                except: pass
        try:
            ftp.rmd(path)
            log(f"  [PURGADO] Carpeta: {path}")
        except: pass
    except: pass

def eliminate_ghost_tile():
    wait_for_ftp()

    ftp = ftplib.FTP()
    ftp.connect(PS5_IP, 2121, timeout=10)
    ftp.login()

    log("=== [1] ERRADICANDO ACCESO DIRECTO FANTASMA DE GOW EN app.db ===")
    try:
        bio = io.BytesIO()
        ftp.retrbinary("RETR /system_data/priv/mms/app.db", bio.write)
        conn = sqlite3.connect(":memory:")
        conn.deserialize(bio.getvalue())
        c = conn.cursor()

        c.execute("DELETE FROM tbl_contentinfo WHERE titleId = 'CUSA07408'")
        c.execute("DELETE FROM tbl_conceptmetadata WHERE conceptName = 'God of War' OR conceptId = 227770")
        c.execute("DELETE FROM tbl_iconinfo_0482932290 WHERE titleId = 'CUSA07408'")
        c.execute("DELETE FROM tbl_concepticoninfo_0482932290 WHERE primaryTitleId = 'CUSA07408' OR conceptName = 'God of War'")
        c.execute("DELETE FROM tbl_iconinfo_0482932291 WHERE titleId = 'CUSA07408'")
        c.execute("DELETE FROM tbl_concepticoninfo_0482932291 WHERE primaryTitleId = 'CUSA07408' OR conceptName = 'God of War'")
        
        # Limpiar flags en tbl_info
        for t in ["tbl_info_0482932290", "tbl_info_0482932291"]:
            try:
                c.execute(f"DELETE FROM {t} WHERE key LIKE '%CUSA07408%'")
            except: pass

        conn.commit()
        clean_bytes = conn.serialize()
        conn.close()

        ftp.storbinary("STOR /system_data/priv/mms/app.db", io.BytesIO(clean_bytes))
        log("[+] app.db reescrito LIMPIO: Icono y carrusel de Home erradicados.")
    except Exception as e:
        log(f"[-] Error en app.db: {e}")

    log("=== [2] AUDITANDO Y SANEANDO appinfo.db ===")
    try:
        bio_info = io.BytesIO()
        ftp.retrbinary("RETR /system_data/priv/mms/appinfo.db", bio_info.write)
        conn_i = sqlite3.connect(":memory:")
        conn_i.deserialize(bio_info.getvalue())
        ci = conn_i.cursor()
        tables = [r[0] for r in ci.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
        cleaned = 0
        for t in tables:
            try:
                rows = ci.execute(f"SELECT rowid, * FROM {t}").fetchall()
                for r in rows:
                    if 'CUSA07408' in str(r) or 'God of War' in str(r):
                        ci.execute(f"DELETE FROM {t} WHERE rowid = {r[0]}")
                        cleaned += 1
            except: pass
        if cleaned > 0:
            conn_i.commit()
            clean_info_bytes = conn_i.serialize()
            ftp.storbinary("STOR /system_data/priv/mms/appinfo.db", io.BytesIO(clean_info_bytes))
            log(f"[+] appinfo.db saneado ({cleaned} entradas eliminadas).")
        else:
            log("[OK] appinfo.db ya estaba limpio.")
        conn_i.close()
    except Exception as e:
        log(f"[-] Error en appinfo.db: {e}")

    log("=== [3] LIMPIEZA DE METADATOS RESIDUALES EN DISCO ===")
    delete_dir_recursive(ftp, "/user/appmeta/CUSA07408")
    delete_dir_recursive(ftp, "/user/temp")
    delete_dir_recursive(ftp, "/user/download")

    ftp.quit()
    log("=== [FIN] ACCESO DIRECTO ELIMINADO DEFINITIVAMENTE DEL SISTEMA ===")

if __name__ == "__main__":
    eliminate_ghost_tile()
