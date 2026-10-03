import urllib.request
import re
import base64

games = [
    ('Mortal Kombat 11', 'https://dlpsgame.com/?s=Mortal+Kombat+11'),
    ('Dragon Ball FighterZ', 'https://dlpsgame.com/?s=Dragon+Ball+FighterZ'),
    ('Grand Theft Auto V', 'https://dlpsgame.com/?s=Grand+Theft+Auto+V')
]

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for name, s_url in games:
    print(f"\n========================================================")
    print(f"SEARCHING: {name}")
    try:
        req = urllib.request.Request(s_url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode('utf-8', errors='ignore')
            posts = re.findall(r'<h2[^>]*class="post-title"[^>]*><a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html)
            for href, p_title in posts[:3]:
                p_clean = re.sub(r'<[^>]+>', '', p_title).strip()
                print(f"  Post: {p_clean} -> {href}")
    except Exception as e:
        print("Search error:", e)
