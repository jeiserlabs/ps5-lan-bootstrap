import ftplib
import io
import sqlite3

ftp = ftplib.FTP()
ftp.connect('192.168.2.2', 2121, timeout=5)
ftp.login()

bio = io.BytesIO()
ftp.retrbinary('RETR /system_data/priv/mms/bgft.db', bio.write)
ftp.quit()

conn = sqlite3.connect(':memory:')
conn.deserialize(bio.getvalue())
c = conn.cursor()

rows = c.execute("SELECT item_id, title_id, title, version, status, error_code, last_updated FROM tbl_downloads WHERE error_code != '0x00000000'").fetchall()
print(f"Total error rows: {len(rows)}")
for r in rows:
    print(r)
