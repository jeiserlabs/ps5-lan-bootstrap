import socket
import urllib.request
import json
import time

PS5_IP = "192.168.2.2"
MINIMAL_CHAIN = "kstuff-lite_v1.11.elf,!8000,pkg-receiver.elf,!2000,ftpsrv-ps5.elf"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_for_8084():
    log(f"Esperando inicio del Autoloader ({PS5_IP}:8084)...")
    while True:
        try:
            s = socket.socket()
            s.settimeout(0.5)
            res = s.connect_ex((PS5_IP, 8084))
            s.close()
            if res == 0:
                log("[+] ¡AUTOLOADER 8084 DETECTADO!")
                return True
        except Exception:
            pass
        time.sleep(0.5)

def apply_minimal_setup():
    wait_for_8084()

    # 1. Configurar cadena dorada minima en :8084
    try:
        url = f"http://{PS5_IP}:8084/set_config"
        req = urllib.request.Request(
            url,
            data=json.dumps({"AUTOLOAD_ENABLED": True, "AUTOLOAD_LIST": MINIMAL_CHAIN}).encode(),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=5) as r:
            log(f"[+] Cadena fijada en Autoloader:\n    {MINIMAL_CHAIN}")
    except Exception as e:
        log(f"[-] Error configurando autoload: {e}")

    # 2. Cargar kstuff-lite 1.11
    try:
        url = f"http://{PS5_IP}:8084/loadpayload:kstuff-lite_v1.11.elf"
        with urllib.request.urlopen(url, timeout=10) as r:
            log(f"[+] kstuff-lite 1.11 inyectado: {r.read().decode()}")
    except Exception as e:
        log(f"[-] Aviso kstuff: {e}")

    # 3. Cargar receiver
    try:
        time.sleep(2.0)
        url = f"http://{PS5_IP}:8084/loadpayload:pkg-receiver.elf"
        with urllib.request.urlopen(url, timeout=5) as r:
            log(f"[+] pkg-receiver inyectado: {r.read().decode()}")
    except Exception as e:
        pass

    # 4. Cargar ftpsrv
    try:
        time.sleep(1.0)
        url = f"http://{PS5_IP}:8084/loadpayload:ftpsrv-ps5.elf"
        with urllib.request.urlopen(url, timeout=5) as r:
            log(f"[+] ftpsrv inyectado: {r.read().decode()}")
    except Exception as e:
        pass

    # 5. Verificar salud final
    time.sleep(1.0)
    for p, name in [(12800, "Receiver"), (2121, "FTP")]:
        s = socket.socket()
        s.settimeout(1.0)
        ok = s.connect_ex((PS5_IP, p)) == 0
        s.close()
        log(f"[VERIFICACION] Puerto {p} ({name}): {'ONLINE' if ok else 'PENDIENTE'}")

    log("=== [FIN] SISTEMA MINIMO ESTABLE LISTO PARA JUGAR ===")

if __name__ == "__main__":
    apply_minimal_setup()
