import urllib.request
import re

req = urllib.request.Request('https://filecrypt.cc/Container/88D4BF0B12.html', headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
with urllib.request.urlopen(req) as resp:
    html = resp.read().decode('utf-8', errors='ignore')

print('Title:', re.findall(r'<title>(.*?)</title>', html))
print('Form action:', re.findall(r'<form[^>]*action="([^"]*)"', html))
print('Has captcha:', 'captcha' in html.lower())
print('Buttons/links:', re.findall(r'href="([^"]+)"[^>]*class="[^"]*button[^"]*"', html))
