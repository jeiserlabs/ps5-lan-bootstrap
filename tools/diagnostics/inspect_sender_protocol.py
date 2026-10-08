import re

exe_path = r"E:\ps5\tools\external\PkgSender\PkgSender.exe"
data = open(exe_path, "rb").read().decode("latin1", "ignore")

for p in ["12800", "api/install", "/install", "packages"]:
    pos = 0
    while True:
        idx = data.find(p, pos)
        if idx == -1: break
        print(f"=== Pattern {p} at {idx} ===")
        print(repr(data[max(0, idx-100):idx+200]))
        pos = idx + len(p)
