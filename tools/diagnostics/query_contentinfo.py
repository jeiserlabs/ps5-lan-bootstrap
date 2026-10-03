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

c.execute("SELECT DISTINCT titleId, titleName, contentId FROM tbl_contentinfo WHERE titleId LIKE 'CUSA%' OR titleId LIKE 'PPSA%' ORDER BY titleId")
for row in c.fetchall():
    print(f"{row[0]}: {row[1]} ({row[2]})")

conn.close()
