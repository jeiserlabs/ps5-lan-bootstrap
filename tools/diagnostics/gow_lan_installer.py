#!/usr/bin/env python3
"""
gow_lan_installer.py - Instalador LAN Gigabit con servidor HTTP Range 206
Instala God of War 2018 (Base + Parche) secuencialmente a ~100 MB/s.
"""

import os
import sys
import time
import json
import socket
import threading
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

PKG_DIR = r"C:\Users\dev\Desktop\DESCARGAS TELEGRAM\God.of.War.2018-CUSA07408"
BASE_PKG = "God.of.War.2018-CUSA07408.pkg"
PATCH_PKG = "GOW_v1.35.PATCH.2018-CUSA07408-.pkg"

PC_IP = "192.168.2.1"
PC_PORT = 9898
PS5_IP = "192.168.2.2"
PS5_PORT = 12800

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

class RangeHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        pass  # Evitar saturar la consola

    def do_HEAD(self):
        filepath = self.get_filepath()
        if not filepath or not os.path.exists(filepath):
            self.send_error(404)
            return
        size = os.path.getsize(filepath)
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(size))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()

    def do_GET(self):
        filepath = self.get_filepath()
        if not filepath or not os.path.exists(filepath):
            self.send_error(404, "File Not Found")
            return

        filesize = os.path.getsize(filepath)
        range_header = self.headers.get("Range")

        start = 0
        end = filesize - 1

        if range_header and range_header.startswith("bytes="):
            try:
                parts = range_header[6:].split("-")
                start = int(parts[0]) if parts[0] else 0
                if len(parts) > 1 and parts[1]:
                    end = int(parts[1])
            except Exception:
                start = 0
                end = filesize - 1

            if start >= filesize:
                self.send_error(416, "Requested Range Not Satisfiable")
                return

            if end >= filesize:
                end = filesize - 1

            length = end - start + 1
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{filesize}")
        else:
            length = filesize
            self.send_response(200)

        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Length", str(length))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()

        try:
            with open(filepath, "rb") as f:
                f.seek(start)
                remaining = length
                buf_size = 512 * 1024  # 512 KB
                while remaining > 0:
                    chunk = f.read(min(remaining, buf_size))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except Exception:
            pass

    def get_filepath(self):
        rel_path = urllib.parse.unquote(self.path.lstrip("/"))
        full = os.path.join(PKG_DIR, rel_path)
        return full if os.path.commonpath([PKG_DIR, full]) == PKG_DIR else None

def start_http_server():
    server = ThreadedHTTPServer(("0.0.0.0", PC_PORT), RangeHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    log(f"[+] Servidor HTTP Gigabit (Range 206) activo en {PC_IP}:{PC_PORT}")
    return server

def get_status():
    try:
        url = f"http://{PS5_IP}:{PS5_PORT}/api/status"
        with urllib.request.urlopen(url, timeout=3) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None

def install_pkg(pkg_name):
    url = f"http://{PC_IP}:{PC_PORT}/{urllib.parse.quote(pkg_name)}"
    install_endpoint = f"http://{PS5_IP}:{PS5_PORT}/install?url={urllib.parse.quote(url)}&name={urllib.parse.quote(pkg_name)}"
    log(f"[*] Enviando orden de instalacion para: {pkg_name}")
    try:
        with urllib.request.urlopen(install_endpoint, timeout=10) as r:
            resp = r.read().decode('utf-8', errors='ignore')
            log(f"[+] Respuesta PS5: {resp.strip()}")
    except Exception as e:
        log(f"[-] Error enviando orden: {e}")
        return False

    log("[*] Esperando que la PS5 inicie la descarga...")
    started = False
    for _ in range(30):
        time.sleep(1)
        st = get_status()
        if st and (st.get("busy") or st.get("pull") or st.get("active", 0) > 0 or st.get("pullGot", 0) > 0):
            started = True
            break

    if not started:
        log("[-] La PS5 no inicio la descarga en 30 segundos.")
        return False

    log("[+] ¡Descarga iniciada en PS5! Monitoreando progreso...")
    last_got = 0
    idle_done = 0
    while True:
        time.sleep(3)
        st = get_status()
        if not st:
            continue
        pull_got = st.get("pullGot", 0)
        pull_want = st.get("pullWant", 1)
        pull_name = st.get("pullName", pkg_name)
        busy = st.get("busy", False)
        active = st.get("active", 0)
        pull = st.get("pull", False)

        if pull_want > 0:
            pct = (pull_got / pull_want) * 100
            got_gb = pull_got / (1024**3)
            want_gb = pull_want / (1024**3)
            delta = max(0, pull_got - last_got)
            speed_mbs = (delta / 3) / (1024**2)
            last_got = pull_got
            log(f"[Progreso] {pull_name}: {got_gb:.2f} / {want_gb:.2f} GB ({pct:.1f}%) | {speed_mbs:.1f} MB/s")

            if pull_got >= pull_want and pull_want > 1000:
                log(f"[+] {pkg_name} completamente descargado ({want_gb:.2f} GB). Esperando consolidacion...")
                while True:
                    time.sleep(3)
                    st2 = get_status()
                    if not st2 or (not st2.get("busy") and st2.get("active", 0) == 0):
                        log(f"[+] ¡{pkg_name} consolidado e instalado con exito en PS5!")
                        return True
        else:
            if not busy and active == 0 and not pull:
                idle_done += 1
                if idle_done >= 3:
                    log(f"[+] Proceso finalizado para {pkg_name}")
                    return True

def main():
    log("==========================================================")
    log("  INSTALADOR LAN GIGABIT - GOD OF WAR 2018 (CUSA07408)")
    log("==========================================================")

    base_path = os.path.join(PKG_DIR, BASE_PKG)
    patch_path = os.path.join(PKG_DIR, PATCH_PKG)

    if not os.path.exists(base_path) or not os.path.exists(patch_path):
        log("[-] ERROR: Archivos PKG no encontrados en la carpeta de descargas.")
        return

    log(f"[*] Base Game:  {BASE_PKG} ({os.path.getsize(base_path) / (1024**3):.2f} GB)")
    log(f"[*] Update:     {PATCH_PKG} ({os.path.getsize(patch_path) / (1024**3):.2f} GB)")

    start_http_server()

    # 1. Instalar Base
    log(">>> PASO 1/2: Instalando Juego Base...")
    if not install_pkg(BASE_PKG):
        log("[-] Fallo la instalacion del Juego Base.")
        return

    time.sleep(5)

    # 2. Instalar Parche
    log(">>> PASO 2/2: Instalando Parche 1.35...")
    if not install_pkg(PATCH_PKG):
        log("[-] Fallo la instalacion del Parche.")
        return

    log("==========================================================")
    log("  ¡GOD OF WAR 2018 (BASE + PARCHE) 100% INSTALADO EN PS5!")
    log("==========================================================")

if __name__ == "__main__":
    main()
