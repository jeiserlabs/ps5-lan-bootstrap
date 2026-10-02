data = open('E:/ps5/pkg-receiver.elf', 'rb').read().decode('latin1', 'ignore')

idx = data.find('ok: install queued for')
start = max(0, idx - 1500)
end = min(len(data), idx + 1000)
print("=== Context of install queued ===")
# print printable strings
s = data[start:end]
import string
clean = ''.join(c if c in string.printable else ' ' for c in s)
print('\n'.join([line for line in clean.split('  ') if len(line.strip()) > 3]))
