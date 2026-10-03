import urllib.request
import re

links = [
    ('Game Base', 'https://akirabox.to/QN9mE5qwm6dW/file'),
    ('Update 1.18 + 60fps', 'https://akirabox.to/qw1zep18p3Xy/file'),
    ('All DLC Deluxe', 'https://akirabox.to/qw1zeoK0mXyn/file')
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
