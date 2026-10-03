import urllib.request
import re

url = 'https://filecrypt.cc/Container/88D4BF0B12.html'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    with urllib.request.urlopen(req, timeout=10) as r:
        html = r.read().decode('utf-8', errors='ignore')
        print('Length:', len(html))
        # Look for file names or links or parts
        names = re.findall(r'<td[^>]*>(.*?)</td>', html)
        print('TDs:', [re.sub(r'<[^>]+>', '', n).strip() for n in names if 'pkg' in n.lower() or 'part' in n.lower() or 'update' in n.lower()][:15])
        if 'captcha' in html.lower():
            print('Captcha present in Filecrypt')
except Exception as e:
    print('Error:', e)
