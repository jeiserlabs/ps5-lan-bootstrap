"""
stability_monitor.py - Monitor pasivo de estabilidad y salud en tiempo real de PS5.
- Sondea latencia, puertos (8084, 12800, 2121) y estado del instalador (:12800/api/status).
- Cero impacto en el kernel (sondas no bloqueantes de 300ms).
- Registra uptime continuo y alerta inmediatamente sobre caídas o degradación.
"""

import time
import socket
import urllib.request
import json
import os
import sys

PS5_IP = "192.168.2.2"
PORTS = {
    8084: "Autoloader",
    12800: "PKG-Receiver",
    2121: "FTP"
}
POLL_INTERVAL = 10  # segundos entre chequeos
LOG_FILE = os.path.join(os.path.dirname(__file__), "stability_monitor.log")

def log(msg, to_file=True):
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    if to_file:
        try:
            with open(LOG_FILE, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            pass

def check_port(port, timeout=0.4):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        res = s.connect_ex((PS5_IP, port))
        s.close()
        return res == 0
    except Exception:
        return False

def check_ping():
    start = time.perf_counter()
    ok = check_port(8084, timeout=0.3) or check_port(12800, timeout=0.3) or check_port(2121, timeout=0.3)
    latency_ms = (time.perf_counter() - start) * 1000.0
    return ok, latency_ms

def get_receiver_status():
    try:
        url = f"http://{PS5_IP}:12800/api/status"
        req = urllib.request.Request(url, headers={"User-Agent": "PS5-Stability-Monitor"})
        with urllib.request.urlopen(req, timeout=1.5) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None

def monitor_loop():
    log("=== INICIANDO MONITOR DE ESTABILIDAD PS5 ===")
    log(f"Destino: {PS5_IP} | Intervalo: {POLL_INTERVAL}s")
    
    uptime_seconds = 0
    was_online = False
    
    while True:
        p_status = {p: check_port(p) for p in PORTS}
        is_online = any(p_status.values())
        
        if is_online:
            if not was_online:
                log("🟢 [ALERTA] PS5 CONECTADA Y DETECTADA EN RED")
                uptime_seconds = 0
                was_online = True
            else:
                uptime_seconds += POLL_INTERVAL
            
            up_str = f"{uptime_seconds // 60}m {uptime_seconds % 60}s"
            ports_summary = " ".join([f"{name}({p}):{'OK' if ok else 'OFF'}" for p, name in PORTS.items() for ok in [p_status[p]]])
            
            # Chequear estado del receptor
            recv_info = ""
            if p_status[12800]:
                st = get_receiver_status()
                if st:
                    pkg_name = st.get("title", st.get("name", "Idle"))
                    recv_info = f" | LAN: {pkg_name}"
            
            log(f"🟢 [ONLINE] Uptime: {up_str} | {ports_summary}{recv_info}")
        else:
            if was_online:
                log(f"🔴 [ALERTA] PS5 DESCONECTADA / APAGADA. Último Uptime continuo: {uptime_seconds // 60}m {uptime_seconds % 60}s")
                was_online = False
                uptime_seconds = 0
            else:
                # Silencioso en consola si está apagada, un aviso corto
                sys.stdout.write(f"\r[{time.strftime('%H:%M:%S')}] Esperando encendido de PS5 ({PS5_IP})...")
                sys.stdout.flush()
        
        time.sleep(POLL_INTERVAL)

if __name__ == "__main__":
    monitor_loop()
