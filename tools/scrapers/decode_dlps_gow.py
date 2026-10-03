import urllib.request
import re
import base64

url = "https://dlpsgame.com/god-of-war-2018-ps4-pkg/"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
with urllib.request.urlopen(req, timeout=10) as resp:
    html = resp.read().decode('utf-8', errors='ignore')

# Find spoilers after CUSA07408
for match in re.finditer(r'<p>(CUSA07408[^<]+)</p>\s*<div[^>]*class="[^"]*su-spoiler[^"]*"[^>]*>.*?data-payload="([^"]+)"', html, re.DOTALL):
    title = match.group(1)
    payload = match.group(2)
    decoded = base64.b64decode(payload).decode('utf-8', errors='ignore')
    print(f"\n==========================================")
    print(f"TITLE: {title}")
    print("DECODED PAYLOAD:")
    print(decoded)
