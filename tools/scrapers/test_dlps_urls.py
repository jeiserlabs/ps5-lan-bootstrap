import urllib.request

urls = [
    'https://dlpsgame.com/mortal-kombat-11-ps4-pkg/',
    'https://dlpsgame.com/dragon-ball-fighterz-ps4-pkg/',
    'https://dlpsgame.com/grand-theft-auto-v-ps4-pkg/'
]

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

for u in urls:
    try:
        req = urllib.request.Request(u, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as r:
            print(f'OK ({r.status}): {u}')
    except Exception as e:
        print(f'FAIL ({e}): {u}')
