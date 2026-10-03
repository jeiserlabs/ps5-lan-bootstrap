import urllib.request
import re
import base64

def get_links(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
    with urllib.request.urlopen(req, timeout=10) as r:
        html = r.read().decode('utf-8', errors='ignore')
    spoilers = re.findall(r'<p>([^<]*(?:CUSA|EUR|USA|v1\.|Ultimate)[^<]*)</p>\s*<div[^>]*class="[^"]*su-spoiler[^"]*"[^>]*>.*?data-payload="([^"]+)"', html, re.DOTALL)
    res = []
    for title, payload in spoilers:
        dec = base64.b64decode(payload).decode('utf-8', errors='ignore')
        links = re.findall(r'href="([^"]+)"[^>]*>(.*?)</a>', dec)
        clean_text = re.sub(r'<[^>]+>', ' ', dec)
        filtered = []
        for href, txt in links:
            txt = re.sub(r'<[^>]+>', '', txt).strip()
            if any(s in href for s in ('akirabox', '1fichier', 'vikingfile', 'buzzheavier')):
                filtered.append((txt, href))
        res.append((title.strip(), ' '.join(clean_text.split())[:300], filtered))
    return res

print("==================== MORTAL KOMBAT 11 ====================")
for title, text, links in get_links('https://dlpsgame.com/mortal-kombat-11-ultimate-edition-ps4-pkg/'):
    print(f"\n--- {title} ---")
    print("TEXT:", text)
    for txt, href in links:
        print(f"  [{txt}]: {href}")

print("\n==================== DRAGON BALL FIGHTERZ ====================")
for title, text, links in get_links('https://dlpsgame.com/dragon-ball-fighterz-ultimate-edition-ps4-pkg/'):
    print(f"\n--- {title} ---")
    print("TEXT:", text)
    for txt, href in links:
        print(f"  [{txt}]: {href}")
