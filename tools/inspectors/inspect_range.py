data = open('E:/ps5/pkg-receiver.elf', 'rb').read().decode('latin1', 'ignore')

idx = data.find('Range: bytes=%lld-%lld')
print('Context around Range: bytes=%lld-%lld:')
print(repr(data[max(0, idx-600):idx+600]))
