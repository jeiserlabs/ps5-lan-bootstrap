#!/usr/bin/env python3
import sys
import ftplib

if len(sys.argv) < 3:
    print("USAGE: verify_installed_ftp.py <TITLE_ID> <CATEGORY>")
    sys.exit(1)

title_id = sys.argv[1].upper()
category = sys.argv[2].upper()
content_id = sys.argv[3].upper() if len(sys.argv) > 3 else None

try:
    ftp = ftplib.FTP()
    ftp.connect("192.168.2.2", 2121, timeout=6)
    ftp.login()

    if category in ["BASE", "FIX"]:
        target_dir = f"/user/app/{title_id}"
        files = []
        ftp.retrlines(f"LIST {target_dir}", files.append)
        has_pkg = any("app.pkg" in f for f in files)
        if has_pkg:
            print("OK")
            sys.exit(0)
    elif category == "UPDATE":
        target_dir = f"/user/patch/{title_id}"
        files = []
        ftp.retrlines(f"LIST {target_dir}", files.append)
        has_patch = any("patch.pkg" in f for f in files)
        if has_patch:
            print("OK")
            sys.exit(0)
    elif category == "DLC":
        target_dir = f"/user/addcont/{title_id}"
        files = []
        ftp.retrlines(f"LIST {target_dir}", files.append)
        # Entrada real = ultima columna, excluyendo . y .. (algunos servidores los listan, otros no)
        real = [l.split()[-1] for l in files if len(l.split()) >= 9 and l.split()[-1] not in ('.', '..')]
        if content_id:
            match = any(r in content_id or content_id.endswith(r) for r in real)
            if match:
                print("OK")
                sys.exit(0)
        elif real:
            print("OK")
            sys.exit(0)
    ftp.quit()
except Exception as e:
    pass

print("NOT_FOUND")
sys.exit(0)
