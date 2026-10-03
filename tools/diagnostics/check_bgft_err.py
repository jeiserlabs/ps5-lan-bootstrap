import ftplib, io, sqlite3

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121, timeout=5)
ftp.login()

bio = io.BytesIO()
ftp.retrbinary('RETR /system_data/priv/mms/bgft.db', bio.write)
ftp.quit()

conn = sqlite3.connect(':memory:')
conn.deserialize(bio.getvalue())
c = conn.cursor()
tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
print("Tables in bgft.db:", tables)
for t in tables:
    cols = [d[0] for d in c.execute(f"SELECT * FROM {t} WHERE 1=0").description]
    print(f"\nTable {t} cols: {cols}")
    rows = c.execute(f"SELECT * FROM {t} ORDER BY rowid DESC LIMIT 3").fetchall()
    for r in rows:
        print("  ", r)
conn.close()
