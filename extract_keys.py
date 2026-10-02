import re

data = open('E:/ps5/pkg-receiver.elf', 'rb').read().decode('latin1', 'ignore')
keys = set(re.findall(r'"([a-zA-Z0-9_\-]+)":', data))
print('JSON keys:', sorted(list(keys)))

idx = data.find('POST /api/install')
if idx != -1:
    print('POST /api/install context:')
    print(data[max(0, idx-400):idx+400])
