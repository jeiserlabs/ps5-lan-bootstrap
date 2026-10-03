import re

data = open('C:/Users/dev/Desktop/PkgSender/PkgSender.exe', 'rb').read().decode('latin1', 'ignore')
urls = re.findall(r'http://[^\s"\'<>]+', data)
filtered = set([u for u in urls if '12800' in u or 'install' in u or 'pkg' in u or 'api' in u])
print("URLs in PkgSender.exe:")
for u in sorted(list(filtered))[:30]:
    print(u)
