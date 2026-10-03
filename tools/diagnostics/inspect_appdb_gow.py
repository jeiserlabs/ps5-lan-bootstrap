import ftplib
import io
import sqlite3

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121, timeout=5)
ftp.login()
bio = io.BytesIO()
ftp.retrbinary('RETR /system_data/priv/mms/app.db', bio.write)
ftp.quit()

conn = sqlite3.connect(':memory:')
conn.deserialize(bio.getvalue())
c = conn.cursor()
tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print("Tables in app.db:", tables)
for t in tables:
    try:
        r = c.execute(f"SELECT * FROM {t} WHERE 1=0").description
        cols = [d[0] for d in r]
        print(f"  {t}: {cols[:8]}")
        res = c.execute(f"SELECT * FROM {t} WHERE rowid IN (SELECT rowid FROM {t} LIMIT 5)").fetchall()
        for row in res:
            if any('CUSA07408' in str(x) for x in row):
                print(f"    FOUND CUSA07408 in {t}: {row}")
    except Exception as e:
        pass
