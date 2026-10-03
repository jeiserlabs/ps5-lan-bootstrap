import urllib.request
import re
import base64

url = 'https://dlpsgame.com/god-of-war-ragnarok-ps4-pkg/'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
with urllib.request.urlopen(req, timeout=10) as r:
    html = r.read().decode('utf-8', errors='ignore')

matches = list(re.finditer(r'<p>([^<]*(?:CUSA|EUR|USA|ASIA|v1\.|Valhalla)[^<]*)</p>\s*<div[^>]*class="[^"]*su-spoiler[^"]*"[^>]*>.*?data-payload="([^"]+)"', html, re.DOTALL))
print(f'Total spoilers found: {len(matches)}')

for m in matches:
    title = m.group(1).strip()
    payload = m.group(2)
    dec = base64.b64decode(payload).decode('utf-8', errors='ignore')
    print('========================================================')
    print('TITLE:', title)
    clean_text = re.sub(r'<[^>]+>', ' ', dec)
    print('TEXT:', ' '.join(clean_text.split())[:400])
    links = re.findall(r'href="([^"]+)"[^>]*>(.*?)</a>', dec)
    for href, txt in links:
        txt = re.sub(r'<[^>]+>', '', txt).strip()
        print(f'  -> [{txt}]: {href}')
