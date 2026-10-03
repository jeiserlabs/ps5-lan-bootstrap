import urllib.request
import re

links = [
    # MK11
    ('MK11 Base (Radiowasnton)', 'https://akirabox.to/9QWmpQJMA3EB/file'),
    ('MK11 Update 1.30 All DLC', 'https://akirabox.to/M2BGwkRpXGj4/file'),
    # DBFZ
    ('DBFZ Base (hako)', 'https://akirabox.to/ZvqzlRDQymaD/file'),
    ('DBFZ Update 1.33', 'https://akirabox.to/BnkmWqXM2zR0/file'),
    ('DBFZ All DLC', 'https://akirabox.to/ex5z24DOnmKq/file'),
    # GTA V
    ('GTA V Base (60fps)', 'https://akirabox.to/Pbe3Pd6JY3lX/file'),
    ('GTA V Update 1.55 (60fps)', 'https://akirabox.to/b5OzdjKgOmB8/file')
]

for label, u in links:
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode('utf-8', errors='ignore')
            title = re.search(r'<title>(.*?)</title>', html).group(1)
            size = re.search(r'([0-9\.]+ (?:GB|MB))', html)
            sz_str = size.group(1) if size else "unknown"
            print(f'{label}:')
            print(f'  Title: {title}')
            print(f'  Size:  {sz_str}')
            print(f'  URL:   {u}\n')
    except Exception as e:
        print(f'{label} failed: {e}\n')
