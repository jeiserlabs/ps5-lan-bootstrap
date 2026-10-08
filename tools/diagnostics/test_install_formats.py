import urllib.request
import json

tests = [
    {"type": "direct", "packages": ["http://192.168.2.1:9898/test.pkg"]},
    {"packages": ["http://192.168.2.1:9898/test.pkg"]},
    {"package": "http://192.168.2.1:9898/test.pkg"},
    {"url": "http://192.168.2.1:9898/test.pkg"},
    {"urls": ["http://192.168.2.1:9898/test.pkg"]},
    {"pkg_url": "http://192.168.2.1:9898/test.pkg"}
]

for t in tests:
    body = json.dumps(t).encode()
    req = urllib.request.Request("http://192.168.2.2:12800/api/install", data=body, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=3) as r:
            print(f"JSON {t} -> {r.read().decode()}")
    except urllib.error.HTTPError as e:
        print(f"JSON {t} -> HTTPError {e.code}: {e.read().decode()}")
    except Exception as e:
        print(f"JSON {t} -> Error: {e}")
