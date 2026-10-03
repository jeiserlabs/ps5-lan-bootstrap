data = open('E:/ps5/pkg-receiver.elf', 'rb').read().decode('latin1', 'ignore')

# search for "install queued for"
idx = data.find('install queued for')
if idx != -1:
    print('Found "install queued for" at', idx)
    print(repr(data[max(0, idx-500):idx+500]))
