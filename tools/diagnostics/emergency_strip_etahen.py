import socket
import urllib.request
import json
import time

PS5_IP = "192.168.2.2"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def strip_etahen():
    log("=== CENTINELA ANTI-ETAHEN ARMADO: ESPERANDO AUTOLOADER :8084 ===")
    while True:
        try:
            s = socket.socket()
            s.settimeout(0.3)
            res = s.connect_ex((PS5_IP, 8084))
            s.close()
            if res == 0:
                log("[+] ¡AUTOLOADER 8084 DETECTADO! Desactivando etaHEN de inmediato...")
                url = f"http://{PS5_IP}:8084/set_config"
                # Desactivamos autoload automático y restauramos la lista limpia
                clean_payload = {
                    "AUTOLOAD_ENABLED": False,
                    "AUTOLOAD_LIST": "kstuff-lite_v1.11.elf,!8000,pkg-receiver.elf,!2000,ftpsrv-ps5.elf"
                }
                req = urllib.request.Request(
                    url,
                    data=json.dumps(clean_payload).encode(),
                    headers={"Content-Type": "application/json"}
                )
                with urllib.request.urlopen(req, timeout=3) as r:
                    log(f"[+] RESPUESTA PS5: {r.read().decode()}")
                    log("[+] ¡EXITO! etaHEN DESACTIVADO y Autoload pausado para evitar apagados.")
                    break
        except Exception:
            pass
        time.sleep(0.1)

if __name__ == "__main__":
    strip_etahen()
