import re

with open('1fichier_dlc.html', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

forms = re.findall(r'<form[^>]*action="([^"]*)"[^>]*>(.*?)</form>', text, re.DOTALL)
for act, body in forms:
    print('Action:', act)
    inputs = re.findall(r'<input[^>]+name="([^"]+)"[^>]+value="([^"]*)"', body)
    print('Inputs:', inputs)
    sub = re.findall(r'<input[^>]+type="submit"[^>]*value="([^"]*)"', body)
    print('Submit:', sub)

# Also check file name and size shown on page
name_m = re.search(r'<td class="normal">([^<]+)</td>', text)
if name_m:
    print('Filename:', name_m.group(1))
