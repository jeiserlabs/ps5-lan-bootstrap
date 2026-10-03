import ftplib, io

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121)
ftp.login()

lines = []
ftp.retrlines('LIST /user/app', lines.append)

print("=== REPORTE FORENSE DE /user/app ===")
for l in lines:
    parts = l.split()
    if not parts or parts[-1] in ['.', '..']: continue
    cusa = parts[-1]
    # Check if app.pkg exists and get its size
    sub = []
    try:
        ftp.retrlines(f'LIST /user/app/{cusa}', sub.append)
    except:
        continue
    pkg_size = 0
    url_info = ""
    for s in sub:
        sp = s.split()
        if not sp or sp[-1] in ['.', '..']: continue
        if sp[-1] == 'app.pkg':
            pkg_size = int(sp[4])
        if sp[-1] == 'app.json':
            bio = io.BytesIO()
            ftp.retrbinary(f'RETR /user/app/{cusa}/app.json', bio.write)
            raw = bio.getvalue().decode('utf-8', errors='ignore')
            if 'pieces' in raw and 'url' in raw:
                import json
                try:
                    j = json.loads(raw)
                    url_info = j['pieces'][0]['url'].split('/')[-1]
                except:
                    url_info = "json_parse_err"
    print(f"[{cusa}] Size: {pkg_size / (1024**3):6.2f} GB | Pkg: {url_info}")

ftp.quit()
