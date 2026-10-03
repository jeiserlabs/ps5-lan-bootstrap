import base64
import urllib.request
import re

url = "https://dlpsgame.com/haven-ps4-pkg/"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})

with urllib.request.urlopen(req) as resp:
    html = resp.read().decode("utf-8", "ignore")

payloads = re.findall(r'data-payload="([^"]+)"', html)
print(f"Found {len(payloads)} payloads:")
for i, p in enumerate(payloads):
    try:
        decoded = base64.b64decode(p).decode("utf-8", "ignore")
        print(f"\n=== SECTION {i+1} ===")
        print(decoded)
    except Exception as e:
        print(f"Error decoding: {e}")
