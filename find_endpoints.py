data = open('E:/ps5/pkg-receiver.elf', 'rb').read().decode('latin1', 'ignore')

for pattern in ['/api/install', '/install', '/api/files/pull']:
    pos = 0
    while True:
        idx = data.find(pattern, pos)
        if idx == -1:
            break
        print(f"=== Pattern {pattern} at {idx} ===")
        print(repr(data[max(0, idx-100):idx+200]))
        pos = idx + len(pattern)
