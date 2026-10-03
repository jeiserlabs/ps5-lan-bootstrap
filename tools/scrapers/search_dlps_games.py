import urllib.request
import re

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for query in ['kombat', 'fighterz', 'grand+theft+auto']:
    url = f'https://dlpsgame.com/?s={query}'
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode('utf-8', errors='ignore')
            links = re.findall(r'<a[^>]+href="(https://dlpsgame\.com/[^"/]+-[^"/]+/)"[^>]*>(.*?)</a>', html)
            print(f'=== Results for {query} ===')
            seen = set()
            for h, t in links:
                t_clean = re.sub(r'<[^>]+>', '', t).strip()
                if h not in seen and len(t_clean) > 3 and not any(x in h for x in ('category', 'tag', 'author', 'page')):
                    seen.add(h)
                    print(f'  {t_clean} -> {h}')
    except Exception as e:
        print(f'Error for {query}:', e)
