import urllib.request
import re
import base64

url = "https://dlpsgame.com/god-of-war-2018-ps4-pkg/"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
with urllib.request.urlopen(req, timeout=10) as resp:
    html = resp.read().decode('utf-8', errors='ignore')

for match in re.finditer(r'<p>([^\n<]+&#8211;[^\n<]+)</p>\s*<div[^>]*class="[^"]*su-spoiler[^"]*"[^>]*>.*?data-payload="([^"]+)"', html, re.DOTALL):
    title = match.group(1).replace('&#8211;', '-')
    payload = match.group(2)
    decoded = base64.b64decode(payload).decode('utf-8', errors='ignore')
    print(f"\n==========================================")
    print(f"TITLE: {title}")
    clean = re.sub(r'<[^>]+>', ' ', decoded)
    print(clean.strip()[:400])
