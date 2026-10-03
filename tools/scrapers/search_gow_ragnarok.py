import urllib.request
import re

search_url = 'https://dlpsgame.com/?s=God+of+War+Ragnarok'
req = urllib.request.Request(search_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        html = r.read().decode('utf-8', errors='ignore')
        posts = re.findall(r'<h2[^>]*class="post-title"[^>]*><a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', html)
        if not posts:
            posts = re.findall(r'<a[^>]+href="(https://dlpsgame\.com/[^"]*ragnarok[^"]*)"[^>]*>(.*?)</a>', html, re.I)
        print('Posts found:')
        for href, title in posts:
            title_clean = re.sub(r'<[^>]+>', '', title).strip()
            print(f'  {title_clean} -> {href}')
except Exception as e:
    print('Search error:', e)
