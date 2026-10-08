#!/usr/bin/env python3
"""
ps5_uptime_monitor.py - Monitor de Telemetría y Tiempo de Encendido PS5
Registra segundo a segundo la estabilidad de red y detecta caídas/Kernel Panics.
"""

import time
import subprocess
import sys
import os

PS5_IP = "192.168.2.2"
LOG_FILE = r"E:\ps5\data\telemetry\uptime_monitor.log"
os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)

def log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass

def ping():
    try:
        res = subprocess.run(
            ["ping", "-n", "1", "-w", "800", PS5_IP],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL
        )
        return res.returncode == 0
    except Exception:
        return False

def main():
    log(f"=== MONITOR DE ESTABILIDAD PS5 INICIADO ({PS5_IP}) ===")
    online = False
    start_time = None
    last_report = 0

    while True:
        alive = ping()
        now = time.time()

        if alive and not online:
            online = True
            start_time = now
            last_report = now
            log(f"🟢 PS5 DETECTADA ONLINE! Iniciando cronómetro de estabilidad...")
        elif not alive and online:
            uptime = int(now - start_time)
            mins = uptime // 60
            secs = uptime % 60
            online = False
            log(f"🔴 PS5 DESCONECTADA / KERNEL PANIC detectado! Tiempo encendida: {mins}m {secs}s")
        elif alive and online:
            uptime = int(now - start_time)
            if now - last_report >= 30:  # Reporte cada 30 segundos
                mins = uptime // 60
                secs = uptime % 60
                log(f"⏱️ PS5 Estable y Online - Tiempo continuo: {mins:02d}m {secs:02d}s")
                last_report = now

        time.sleep(2)

if __name__ == "__main__":
    main()
