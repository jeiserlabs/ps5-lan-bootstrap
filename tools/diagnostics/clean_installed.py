import json

with open('e:/ps5/installed_pkgs_ps5.json', 'r', encoding='utf-8') as f:
    pkgs = json.load(f)

# Filter out any packages belonging to GoW 2018 or Ragnarok
cleaned = [p for p in pkgs if '07410' not in p and '34386' not in p]

with open('e:/ps5/installed_pkgs_ps5.json', 'w', encoding='utf-8') as f:
    json.dump(cleaned, f, indent=2)

print(f"Original: {len(pkgs)} pkgs | Cleaned: {len(cleaned)} pkgs")
print(f"Removed {len(pkgs) - len(cleaned)} false positive GoW packages.")
