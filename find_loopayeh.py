data = open('E:/ps5/pkg-receiver.elf', 'rb').read().decode('latin1', 'ignore')

pos = data.find('Loopayeh:')
while pos != -1:
    print('Loopayeh string at', pos, ':', repr(data[pos:pos+60]))
    pos = data.find('Loopayeh:', pos+1)
