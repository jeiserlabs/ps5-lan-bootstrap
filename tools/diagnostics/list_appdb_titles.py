import sqlite3

conn = sqlite3.connect('app.db')
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in c.fetchall()]
print("Tables:", tables)

for t in tables:
    c.execute(f"PRAGMA table_info({t})")
    cols = [r[1] for r in c.fetchall()]
    print(f"\nTable {t} cols: {cols}")
    if 'titleId' in cols or 'title_id' in cols:
        id_col = 'titleId' if 'titleId' in cols else 'title_id'
        c.execute(f"SELECT * FROM {t} WHERE {id_col} LIKE 'CUSA%' OR {id_col} LIKE 'PPSA%'")
        rows = c.fetchall()
        print(f"Rows count in {t}: {len(rows)}")
        for r in rows:
            print(f"  {r}")
conn.close()
