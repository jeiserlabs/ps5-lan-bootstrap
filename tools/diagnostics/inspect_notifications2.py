import ftplib
import io
import sqlite3
import json

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121, timeout=5)
ftp.login()
bio = io.BytesIO()
ftp.retrbinary('RETR /system_data/priv/mms/notification2.db', bio.write)
ftp.quit()

conn = sqlite3.connect(':memory:')
conn.deserialize(bio.getvalue())
c = conn.cursor()

row = c.execute("SELECT raw_data FROM notification WHERE bundle_name LIKE '%GODOFWAR/UpdatePatch%' ORDER BY rowid DESC LIMIT 1").fetchone()
if row:
    d = json.loads(row[0])
    print(json.dumps(d, indent=2, ensure_ascii=False))
else:
    print("Row not found")
