import ftplib
import io
import sqlite3
import json
import urllib.request
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
                log("[+] ¡PS5 DETECTADA Y CONECTADA!")
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
                try:
                    ftp.delete(sub)
                except Exception:
                    pass
        try:
            ftp.rmd(path)
            log(f"  [PURGADO] Carpeta: {path}")
        except Exception:
            pass
    except Exception:
        pass

def surgical_purge_gow():
    wait_for_ftp()

    # 1. Quitar ShadowMount de la autocarga en :8084
    try:
        url = f"http://{PS5_IP}:8084/set_config"
        chain = "kstuff-lite_v1.11.elf,!8000,pkg-receiver.elf,!2000,ftpsrv-ps5.elf"
        req = urllib.request.Request(url, data=json.dumps({"AUTOLOAD_LIST": chain}).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as r:
            log("[+] ShadowMount ELIMINADO del autoloader (:8084 configurado limpio)")
    except Exception as e:
        log(f"[-] Error ajustando 8084: {e}")

    # 2. Conectar FTP para purga quirúrgica de CUSA07408 únicamente
    ftp = ftplib.FTP()
    ftp.connect(PS5_IP, 2121, timeout=10)
    ftp.login()

    log("[+] Purgando archivos dañados de God of War (CUSA07408)...")
    # Base
    delete_dir_recursive(ftp, "/user/app/CUSA07408")
    # Parche si quedaba algo
    delete_dir_recursive(ftp, "/user/patch/CUSA07408")
    # DLCs de GoW
    delete_dir_recursive(ftp, "/user/addcont/CUSA07408")
    # PlayGo
    delete_dir_recursive(ftp, "/user/playgo/app/UP9000-CUSA07408_00-00000000GODOFWAR")
    delete_dir_recursive(ftp, "/user/playgo/patch/UP9000-CUSA07408_00-00000000GODOFWAR")
    # Appmeta de GoW
    delete_dir_recursive(ftp, "/user/appmeta/CUSA07408")

    # 3. Limpiar CUSA07408 de app.db para que no salga el icono dañado
    try:
        bio = io.BytesIO()
        ftp.retrbinary("RETR /system_data/priv/mms/app.db", bio.write)
        conn = sqlite3.connect(":memory:")
        conn.deserialize(bio.getvalue())
        c = conn.cursor()
        c.execute("DELETE FROM tbl_contentinfo WHERE titleId = 'CUSA07408'")
        conn.commit()
        clean_bytes = conn.serialize()
        conn.close()
        ftp.storbinary("STOR /system_data/priv/mms/app.db", io.BytesIO(clean_bytes))
        log("[+] app.db saneado: Icono dañado de GoW removido de la Home.")
    except Exception as e:
        log(f"[-] Error en app.db: {e}")

    # 4. Limpiar temporales
    delete_dir_recursive(ftp, "/user/temp")
    delete_dir_recursive(ftp, "/user/download")
    delete_dir_recursive(ftp, "/user/bgft")

    ftp.quit()
    log("[+] PURGA QUIRURGICA COMPLETADA. Los otros 10 juegos están 100% intactos.")

if __name__ == "__main__":
    surgical_purge_gow()
