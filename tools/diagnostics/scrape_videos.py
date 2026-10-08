import json
import subprocess
import os

video_ids = [
    "Zj8Arxo7Ck4",
    "EphjVTsoF-w",
    "8yg8CBUTjeY",
    "2yl_hPWkwX8",
    "isuIsMLfT34",
    "yWUOXKChEtQ",
    "IBH3TeRiN_E",
    "sdnS9u-sGIU",
    "kap3cpAHYPg"
]

results = []

for vid in video_ids:
    url = f"https://www.youtube.com/watch?v={vid}"
    cmd = [
        "yt-dlp",
        "--dump-json",
        "--skip-download",
        url
    ]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(p.stdout)
        summary = {
            "id": vid,
            "title": data.get("title"),
            "uploader": data.get("uploader"),
            "upload_date": data.get("upload_date"),
            "description": data.get("description", "")[:1500]  # truncate long desc
        }
        results.append(summary)
        print(f"[+] Scraped: {vid} - {summary['title']}")
    except Exception as e:
        print(f"[-] Failed {vid}: {e}")

out_path = r"E:\ps5\data\yt_scraped_summary.json"
os.makedirs(os.path.dirname(out_path), exist_ok=True)
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2, ensure_ascii=False)

print(f"[DONE] Saved {len(results)} summaries to {out_path}")
