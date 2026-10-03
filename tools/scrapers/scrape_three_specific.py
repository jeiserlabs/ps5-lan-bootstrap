import urllib.request
import re
import base64

targets = [
    ('Mortal Kombat 11 Ultimate', 'https://dlpsgame.com/mortal-kombat-11-ultimate-edition-ps4-pkg/'),
    ('Dragon Ball FighterZ', 'https://dlpsgame.com/dragon-ball-fighterz-ultimate-edition-ps4-pkg/'),
    ('Grand Theft Auto V', 'https://dlpsgame.com/grand-theft-auto-v-ps4-pkg/')
]

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for name, url in targets:
    print(f"\n========================================================================")
    print(f"SCRAPING: {name} ({url})")
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as r:
            html = r.read().decode('utf-8', errors='ignore')
            spoilers = re.findall(r'<p>([^<]*(?:CUSA|EUR|USA|v1\.|Ultimate)[^<]*)</p>\s*<div[^>]*class="[^"]*su-spoiler[^"]*"[^>]*>.*?data-payload="([^"]+)"', html, re.DOTALL)
            for title, payload in spoilers:
                dec = base64.b64decode(payload).decode('utf-8', errors='ignore')
                links = re.findall(r'href="([^"]+)"[^>]*>(.*?)</a>', dec)
                print(f"\n--- TITLE: {title.strip()} ---")
                text_clean = re.sub(r'<[^>]+>', ' ', dec)
                print('INFO:', ' '.join(text_clean.split())[:250])
                for href, txt in links:
                    txt = re.sub(r'<[^>]+>', '', txt).strip()
                    if any(s in href for s in ('akirabox', '1fichier', 'vikingfile', 'buzzheavier', 'filecrypt')):
                        print(f"  [{txt}]: {href}")
    except Exception as e:
        print("Error:", e)
