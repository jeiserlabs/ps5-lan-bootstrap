#!/usr/bin/env python3
"""
stream_monitor_ragnarok.py - Monitor de transferencia LAN para God of War Ragnarök Base.
Registra cada 30 segundos el avance en GB, % y velocidad hasta que se complete.
"""

import time
import re
import os

LOG_FILE = r"e:\ps5\data\logs\ps5_pipeline.log"
TOTAL_BYTES = 90546438144

def main():
    last_byte = 0
    last_time = time.time()
    
    while True:
        time.sleep(30)
        if not os.path.exists(LOG_FILE):
            continue

        with open(LOG_FILE, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()[-30:]

        cur_byte = None
        for l in reversed(lines):
            m = re.search(r"bytes=(\d+)-(\d+)", l)
            if m:
                cur_byte = int(m.group(2))
                break

        if cur_byte:
            now = time.time()
            dt = max(1, now - last_time)
            delta = max(0, cur_byte - last_byte)
            speed = (delta / dt) / (1024**2) if last_byte > 0 else 0
            
            gb = cur_byte / (1024**3)
            tot_gb = TOTAL_BYTES / (1024**3)
            pct = (cur_byte / TOTAL_BYTES) * 100
            rem_gb = tot_gb - gb
            eta_m = (rem_gb * 1024 / speed / 60) if speed > 0 else 0
            
            print(f"[{time.strftime('%H:%M:%S')}] Stream: {gb:.2f} / {tot_gb:.2f} GB ({pct:.1f}%) | {speed:.1f} MB/s | ETA: {eta_m:.1f}m", flush=True)
            
            last_byte = cur_byte
            last_time = now
            
            if cur_byte >= TOTAL_BYTES - 50000000:
                print(f"[{time.strftime('%H:%M:%S')}] ¡Transferencia de Ragnarök Base completada al 100%!", flush=True)
                break

if __name__ == "__main__":
    main()
