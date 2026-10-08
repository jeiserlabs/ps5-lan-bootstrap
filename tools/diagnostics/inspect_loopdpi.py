import re

exe_path = r"E:\ps5\tools\external\PkgSender\PkgSender.exe"
data = open(exe_path, "rb").read().decode("latin1", "ignore")

matches = set(re.findall(r'/api/[a-zA-Z0-9_/]+', data))
print("Endpoints found in PkgSender.exe:")
for ep in sorted(matches):
    print(" ", ep)

# Also search for POST payloads
pos = 0
for term in ["packages", "direct", "/api/install", "pull"]:
    idx = data.find(term)
    if idx != -1:
        print(f"\nContext around '{term}':")
        print(repr(data[max(0, idx-50):idx+150]))
