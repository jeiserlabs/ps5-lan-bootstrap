import urllib.request
import json

url = "https://api.github.com/repos/itsPLK/ps5-webkit-autoloader/releases"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})

try:
    with urllib.request.urlopen(req, timeout=10) as r:
        releases = json.loads(r.read().decode())
        print(f"Total releases: {len(releases)}\n")
        for rel in releases:
            tag = rel.get("tag_name", "")
            name = rel.get("name", "")
            pub = rel.get("published_at", "")[:10]
            body = rel.get("body", "")
            print(f"=== {tag} ({pub}) : {name} ===")
            print("Description:")
            for line in body.splitlines()[:15]:
                print(f"  {line}")
            print("\nAssets:")
            for a in rel.get("assets", []):
                aname = a.get("name", "")
                size = a.get("size", 0)
                durl = a.get("browser_download_url", "")
                print(f"  - {aname} ({size} bytes) -> {durl}")
            print("\n" + "="*50 + "\n")
except Exception as e:
    print("Error:", e)
