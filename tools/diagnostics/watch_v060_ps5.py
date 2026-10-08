#!/usr/bin/env python3
"""
watch_v060_ps5.py - Centinela para la nueva v0.6.0:
1. Espera a que la PS5 complete el exploit de la v0.6.0 y abra :8084.
2. Asegura que SCAN_USB_PAYLOADS este activo.
3. Inyecta kstuff.elf y pkg-receiver.elf desde la USB.
4. Verifica puerto 12800 listo para instalar God of War.
"""

import time
import socket
import urllib.request
import json

PS5_IP = "192.168.2.2"

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def wait_for_autoloader(timeout=3600):
    log(f"Esperando exploit v0.6.0 en PS5 ({PS5_IP}:8084)...")
    start = time.time()
    last_log = 0
    while time.time() - start < timeout:
        try:
            s = socket.socket()
            s.settimeout(0.4)
            if s.connect_ex((PS5_IP, 8084)) == 0:
                s.close()
                log("[+] ¡AUTOLOADER 8084 DETECTADO ONLINE!")
                return True
            s.close()
        except Exception:
            pass
        if time.time() - last_log > 180:
            log("[*] A la escucha de la PS5... (abre Guía de Usuario en la consola)")
            last_log = time.time()
        time.sleep(1)
    return False

def activate_usb_payloads():
    url = f"http://{PS5_IP}:8084/set_config"
    cfg = {
        "AUTOLOAD_ENABLED": True,
        "SCAN_USB_PAYLOADS": True,
        "AUTOLOAD_LIST": "!8000,kstuff.elf,!5000,pkg-receiver.elf,!5000,ftpsrv-ps5.elf",
        "AUTOLOAD_DELAY": 5,
        "AUTO_BROWSER_OPEN": False,
        "KILL_DISC_PLAYER_ON_STARTUP": True,
        "AUTO_INSTALL_APP": False
    }
    try:
        req = urllib.request.Request(url, data=json.dumps(cfg).encode(), headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=5) as r:
            log(f"[+] Configurado SCAN_USB_PAYLOADS = True: {r.read().decode().strip()}")
    except Exception as e:
        log(f"[-] set_config: {e}")

    for p in ["kstuff.elf", "pkg-receiver.elf", "ftpsrv-ps5.elf"]:
        try:
            load_url = f"http://{PS5_IP}:8084/loadpayload:{p}"
            with urllib.request.urlopen(load_url, timeout=5) as r:
                log(f"[+] Payload activado ({p}): {r.read().decode().strip()}")
        except Exception as e:
            log(f"[*] Payload {p}: {e}")

    time.sleep(2)
    for port, name in [(8084, "Autoloader"), (12800, "PKG-Receiver"), (2121, "FTP")]:
        s = socket.socket()
        s.settimeout(0.5)
        st = "ONLINE" if s.connect_ex((PS5_IP, port)) == 0 else "OFFLINE"
        s.close()
        log(f"    Puerto {port} ({name}): {st}")

def main():
    if wait_for_autoloader():
        time.sleep(1)
        activate_usb_payloads()
        log("[LISTO] SISTEMA PREPARADO Y ACTIVO PARA INSTALACION LAN")

if __name__ == "__main__":
    main()
