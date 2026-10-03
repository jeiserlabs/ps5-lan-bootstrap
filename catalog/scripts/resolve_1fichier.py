import urllib.request
import urllib.parse
import re

url = "https://1fichier.com/?7lou426eo1ffnl5e9bec"
headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        html = resp.read().decode("utf-8", "ignore")

    print(f"Loaded page: {len(html)} bytes")
    forms = re.findall(r'<form [^>]*>.*?</form>', html, re.DOTALL)
    print(f"Found {len(forms)} forms:")
    for f in forms:
        print("FORM:", f[:300])

    if actions:
        post_url = actions[0]
        data = urllib.parse.urlencode({k: v for k, v in inputs}).encode("utf-8")
        post_req = urllib.request.Request(post_url, data=data, headers=headers)
        with urllib.request.urlopen(post_req, timeout=10) as p_resp:
            p_html = p_resp.read().decode("utf-8", "ignore")
            print(f"Post response: {len(p_html)} bytes")
            # find download button/link
            links = re.findall(r'href="(https?://[^"]+)" class="ok btn', p_html)
            if not links:
                links = re.findall(r'href="(https?://[a-zA-Z0-9\.\-]*1fichier\.com/[^"]+)"', p_html)
            print("Direct Download Links:", links)

except Exception as e:
    print("Error:", e)
