import sqlite3

conn = sqlite3.connect(r'e:\ps5\data\backups\app.db')
c = conn.cursor()

c.execute("DELETE FROM tbl_contentinfo WHERE titleId = 'CUSA07408'")
c.execute("DELETE FROM tbl_conceptmetadata WHERE conceptName = 'God of War' OR conceptId = 227770")
c.execute("DELETE FROM tbl_iconinfo_0482932290 WHERE titleId = 'CUSA07408'")
c.execute("DELETE FROM tbl_concepticoninfo_0482932290 WHERE primaryTitleId = 'CUSA07408' OR conceptName = 'God of War'")
c.execute("DELETE FROM tbl_iconinfo_0482932291 WHERE titleId = 'CUSA07408'")
c.execute("DELETE FROM tbl_concepticoninfo_0482932291 WHERE primaryTitleId = 'CUSA07408' OR conceptName = 'God of War'")
conn.commit()

tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
found = 0
for t in tables:
    for r in c.execute(f"SELECT * FROM {t}").fetchall():
        if 'CUSA07408' in str(r) or 'cid:scp:00000000000379ba' in str(r) or 'God of War' in str(r):
            print(f"Sigue en {t}: {r}")
            found += 1
if found == 0:
    print("VERIFICACION PERFECTA: Cero rastros de CUSA07408 en app.db!")
