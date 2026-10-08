import urllib.request
import json

url = "https://api.github.com/users/EchoStretch/repos?per_page=100&sort=updated"
req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})

try:
    with urllib.request.urlopen(req, timeout=10) as r:
        repos = json.loads(r.read().decode())
        print(f"Total EchoStretch repos: {len(repos)}\n")
        for repo in repos:
            name = repo.get("name", "")
            updated = repo.get("updated_at", "")[:10]
            stars = repo.get("stargazers_count", 0)
            fork = repo.get("fork", False)
            desc = str(repo.get("description", ""))[:75]
            print(f"{name:<35} | {updated} | Stars: {stars:<3} | Fork: {fork!s:<5} | {desc}")
except Exception as e:
    print("Error:", e)
