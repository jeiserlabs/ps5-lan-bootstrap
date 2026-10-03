import ftplib
import io
import sqlite3

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121, timeout=5)
ftp.login()

bio = io.BytesIO()
ftp.retrbinary('RETR /system_data/priv/mms/notification2.db', bio.write)
ftp.quit()

conn = sqlite3.connect(':memory:')
conn.deserialize(bio.getvalue())
c = conn.cursor()

tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print("Tables in notification2.db:", tables)

for t in tables:
    try:
        cols = [d[0] for d in c.execute(f"SELECT * FROM {t} LIMIT 1").description]
        rows = c.execute(f"SELECT * FROM {t} ORDER BY rowid DESC LIMIT 10").fetchall()
        print(f"\n--- {t} ({len(rows)} rows) ---")
        print("Cols:", cols)
        for r in rows:
            print("Row:", r)
    except Exception as e:
        print(f"Err {t}: {e}")
