import urllib.request
import re

url = "https://dlpsgame.com/haven-ps4-pkg/"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})

try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("utf-8", "ignore")

    print(f"Loaded {len(html)} bytes from {url}")
    
    # Title & CUSA
    cusas = set(re.findall(r"CUSA\d{5}", html))
    print(f"CUSA detected: {cusas}")

    # Look for download paragraphs or links
    # DLPS usually has sections with links
    all_links = re.findall(r'href=["\'](https?://[^"\']+)["\']', html)
    
    download_hosts = ["mediafire", "1fichier", "mega.nz", "qiwi", "ouo.io", "ouo.press"]
    matched = [l for l in all_links if any(h in l for h in download_hosts)]
    
    print(f"Found {len(matched)} download/shortener links:")
    for m in matched:
        print(f" - {m}")

except Exception as e:
    print(f"Error: {e}")
