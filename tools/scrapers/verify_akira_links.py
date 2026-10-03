import urllib.request
import re

urls = [
    'https://akirabox.to/qLQ36oZ7Yz19/file',
    'https://akirabox.to/M2BGw6Mapzj4/file',
    'https://akirabox.com/qLQ36oZ7Yz19/file',
    'https://akirabox.com/M2BGw6Mapzj4/file'
]

for u in urls:
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode('utf-8', errors='ignore')
            title = re.findall(r'<title>(.*?)</title>', html)
            m_size = re.search(r'"size":(\d+)', html)
            size_gb = int(m_size.group(1)) / (1024**3) if m_size else 0
            m_name = re.search(r'"name":"([^"]+)"', html)
            name = m_name.group(1) if m_name else 'unknown'
            print(f'URL: {u}')
            print(f'  Resolved: {r.geturl()}')
            print(f'  Title: {title}')
            print(f'  File: {name} ({size_gb:.2f} GB)\n')
    except Exception as e:
        print(f'URL {u} failed: {e}\n')
