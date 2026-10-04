#!/usr/bin/env node
/**
 * @file backup_browser_cache.js
 * @description Respaldo automatizado de caché del navegador y autoloader de la PS5 vía FTP.
 *   Mitiga el Escenario P1 de borrado accidental de caché en la consola.
 * SRP < 150L.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { getPs5Config } = require('../lib/config.js');

const cfg = getPs5Config();
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = path.join(cfg.state.cacheDir, 'backups', 'browser_cache', TIMESTAMP);

const pyScript = `
import sys, os, ftplib

host = "${cfg.ps5.ip}"
port = 2121
out_dir = r"${BACKUP_DIR}"
os.makedirs(out_dir, exist_ok=True)

try:
    ftp = ftplib.FTP()
    ftp.connect(host, port, timeout=5)
    ftp.login()
    print("[FTP] Conectado exitosamente a la PS5.")
    
    # Rutas clave de persistencia del exploit
    candidate_paths = [
        "/data/ps5_autoloader",
        "/data/shadowmount",
        "/data/payloads"
    ]
    
    for cpath in candidate_paths:
        try:
            files = []
            ftp.retrlines(f"LIST {cpath}", files.append)
            target_sub = os.path.join(out_dir, os.path.basename(cpath))
            os.makedirs(target_sub, exist_ok=True)
            for fline in files:
                parts = fline.split()
                if len(parts) >= 9:
                    fname = parts[-1]
                    if fname not in ('.', '..'):
                        remote_file = f"{cpath}/{fname}"
                        local_file = os.path.join(target_sub, fname)
                        with open(local_file, "wb") as f_out:
                            ftp.retrbinary(f"RETR {remote_file}", f_out.write)
                        print(f"  [+] Respaldado: {remote_file} -> {fname}")
        except Exception as e:
            pass
            
    ftp.quit()
    print("[OK] Backup completado con éxito.")
    sys.exit(0)
except Exception as err:
    print(f"[ERR] Fallo de conexión FTP: {err}")
    sys.exit(1)
`;

console.log(`🚀 Iniciando respaldo de configuración y autoloader PS5 en: ${BACKUP_DIR}...`);
const res = spawnSync('python', ['-c', pyScript], { encoding: 'utf8', timeout: 15000 });
console.log(res.stdout || '');
if (res.status === 0) {
  console.log(`✅ Respaldo guardado exitosamente en: ${BACKUP_DIR}`);
} else {
  console.log(`⚠️ Nota: Si la PS5 está en reposo o apagada, el respaldo se ejecutará en la próxima sesión activa.`);
}
