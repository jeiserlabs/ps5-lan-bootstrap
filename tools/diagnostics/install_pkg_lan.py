"""
install_pkg_lan.py - Instalador LAN seguro bajo demanda para PS5 (Puerto 12800).
- Instala un PKG especifico solo cuando el usuario lo solicita.
- Verifica salud de puertos 12800 y 9898 antes de enviar comandos.
- Monitorea progreso sin bucles agresivos.
"""

import sys
import os
import socket
import urllib.request
import urllib.parse
import json
import time

PS5_IP = "192.168.2.2"
PS5_PORT = 12800
PC_HOST = "192.168.2.1"
PC_PORT = 9898

def check_port(ip, port, timeout=1.0):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        res = s.connect_ex((ip, port))
        s.close()
        return res == 0
    except Exception:
        return False

def install_pkg(pkg_filename):
    print(f"[*] Preparando instalacion LAN para: {pkg_filename}")
    
    # 1. Verificar PC Server
    if not check_port("127.0.0.1", PC_PORT):
        print(f"[-] ERROR: El servidor de archivos de PC (:9898) no esta respondiendo.")
        return False
    print(f"[+] Servidor HTTP de PC (:9898) listo.")

    # 2. Verificar PS5 Receiver
    if not check_port(PS5_IP, PS5_PORT):
        print(f"[-] ERROR: PS5 PKG-Receiver ({PS5_IP}:{PS5_PORT}) no esta respondiendo.")
        print("    Asegurate de que la consola este encendida y el Autoloader haya cargado pkg-receiver.")
        return False
    print(f"[+] Receptor de PS5 ({PS5_IP}:{PS5_PORT}) ONLINE.")

    # 3. Construir URL de instalacion
    file_url = f"http://{PC_HOST}:{PC_PORT}/{urllib.parse.quote(pkg_filename)}"
    install_url = f"http://{PS5_IP}:{PS5_PORT}/install?url={urllib.parse.quote(file_url)}&name={urllib.parse.quote(pkg_filename)}"
    
    print(f"[*] Enviando solicitud de instalacion a PS5...")
    try:
        req = urllib.request.Request(install_url, headers={"User-Agent": "PS5-LAN-Installer"})
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode()
            print(f"[+] Respuesta de PS5: {body}")
    except Exception as e:
        print(f"[-] Error enviando peticion: {e}")
        return False

    # 4. Monitorear progreso
    print("[*] Monitoreando progreso de descarga y consolidacion en PS5...")
    last_status = None
    for _ in range(60):  # hasta 5 minutos de sondeo suave
        time.sleep(5)
        try:
            status_url = f"http://{PS5_IP}:{PS5_PORT}/api/status"
            with urllib.request.urlopen(status_url, timeout=3) as r:
                st = json.loads(r.read().decode())
                if st != last_status:
                    print(f"    [Progreso PS5] {st}")
                    last_status = st
                if st.get("status") in ["completed", "success", "done"]:
                    print("[+] ¡INSTALACION COMPLETADA CON EXITO EN PS5!")
                    return True
        except Exception:
            pass

    print("[*] Instalacion iniciada en segundo plano en PS5.")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python install_pkg_lan.py <nombre_archivo.pkg>")
        sys.exit(1)
    install_pkg(sys.argv[1])
