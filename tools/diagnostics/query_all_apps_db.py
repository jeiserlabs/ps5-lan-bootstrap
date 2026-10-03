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
print("Tables in PS5 app.db:", tables)
for t in tables:
    count = c.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
    cols = [d[0] for d in c.execute(f"SELECT * FROM {t} WHERE 1=0").description]
    print(f"\n{t} ({count} rows, cols: {cols[:6]})")
    # Search for CUSA
    rows = c.execute(f"SELECT * FROM {t} LIMIT 10").fetchall()
    for row in rows:
        row_str = str(row)
        if 'CUSA' in row_str or 'PPSA' in row_str:
            print("  ", row[:5])
conn.close()
