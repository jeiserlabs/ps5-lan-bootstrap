import urllib.request
import re

url = "https://dlpsgame.com/god-of-war-2018-ps4-pkg/"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
    
    # Search for CUSA07408 sections
    pos = 0
    while True:
        idx = html.find('CUSA07408', pos)
        if idx == -1: break
        print("=== MATCH AT", idx, "===")
        snippet = html[max(0, idx-100):min(len(html), idx+1500)]
        print(snippet[:600])
        print("...")
        pos = idx + len('CUSA07408')
except Exception as e:
    print("Err:", e)
