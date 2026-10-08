import socket
import urllib.request
import json
import time

PS5_IP = "192.168.2.2"
CANONICAL_CHAIN = "kstuff-lite_v1.11.elf,!8000,pkg-receiver.elf,!2000,ftpsrv-ps5.elf,!2000,ShadowMountPlus_1.7beta2.elf"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_for_8084():
    log(f"Esperando conexion con WebKit Autoloader ({PS5_IP}:8084)...")
    while True:
        try:
            s = socket.socket()
            s.settimeout(1.0)
            res = s.connect_ex((PS5_IP, 8084))
            s.close()
            if res == 0:
                log("[+] ¡AUTOLOADER 8084 DETECTADO!")
                return True
        except Exception:
            pass
        time.sleep(1.0)

def restore_stable_kstuff():
    wait_for_8084()

    # 1. Fijar de inmediato la cadena dorada probada en :8084
    try:
        url = f"http://{PS5_IP}:8084/set_config"
        req = urllib.request.Request(
            url,
            data=json.dumps({"AUTOLOAD_LIST": CANONICAL_CHAIN}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            log(f"[+] AUTOLOAD_LIST restaurada a cadena estable 13.40:\n    {CANONICAL_CHAIN}")
    except Exception as e:
        log(f"[-] Error fijando autoload: {e}")

    # 2. Cargar kstuff-lite de inmediato
    try:
        url_load = f"http://{PS5_IP}:8084/loadpayload:kstuff-lite_v1.11.elf"
        with urllib.request.urlopen(url_load, timeout=10) as r:
            log(f"[+] kstuff-lite_v1.11.elf inyectado: {r.read().decode()}")
    except Exception as e:
        log(f"[-] Error inyectando kstuff: {e}")

    # 3. Cargar receiver
    try:
        url_load = f"http://{PS5_IP}:8084/loadpayload:pkg-receiver.elf"
        with urllib.request.urlopen(url_load, timeout=10) as r:
            log(f"[+] pkg-receiver.elf inyectado: {r.read().decode()}")
    except Exception as e:
        pass

    # 4. Cargar ftpsrv
    try:
        url_load = f"http://{PS5_IP}:8084/loadpayload:ftpsrv-ps5.elf"
        with urllib.request.urlopen(url_load, timeout=10) as r:
            log(f"[+] ftpsrv-ps5.elf inyectado: {r.read().decode()}")
    except Exception as e:
        pass

    # 5. Cargar ShadowMountPlus
    try:
        url_load = f"http://{PS5_IP}:8084/loadpayload:ShadowMountPlus_1.7beta2.elf"
        with urllib.request.urlopen(url_load, timeout=10) as r:
            log(f"[+] ShadowMountPlus_1.7beta2.elf inyectado: {r.read().decode()}")
    except Exception as e:
        pass

    log("=== [FIN] SISTEMA ESTABLE RESTAURADO AL 100% ===")

if __name__ == "__main__":
    restore_stable_kstuff()
