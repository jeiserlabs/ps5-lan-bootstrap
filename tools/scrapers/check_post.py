import re

with open('1fichier_post.html', 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

print('Length of response:', len(text))
btns = re.findall(r'<a[^>]+href="([^"]+)"[^>]*class="[^"]*ok[^"]*"', text)
print('OK buttons:', btns)
all_a = re.findall(r'<a[^>]+href="([^"]+)"[^>]*>([^<]+)</a>', text)
for href, title in all_a:
    if 'Click here' in title or 'Download' in title or 'telecharger' in title.lower() or 'dl' in href:
        print(f'Match: {title.strip()} -> {href}')
