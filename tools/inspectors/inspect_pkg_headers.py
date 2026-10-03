import struct
import os

def dump_pkg_info(path):
    print(f"\n==========================================")
    print(f"FILE: {os.path.basename(path)}")
    with open(path, 'rb') as f:
        f.seek(0x0c)
        file_count, entry_count = struct.unpack('>II', f.read(8))
        table_offset, entry_data_size = struct.unpack('>II', f.read(8))
        f.seek(table_offset)
        entries = []
        for i in range(entry_count):
            data = f.read(32)
            if len(data) < 32: break
            entry_id, filename_offset, flags1, flags2, offset, size, pad1, pad2 = struct.unpack('>IIIIIIII', data)
            entries.append((entry_id, offset, size))
            if entry_id in [0x1000, 0x1001, 0x1002, 0x1004, 0x1005, 0x1006, 0x1007, 0x1008]:
                print(f"Entry 0x{entry_id:04x}: offset={offset}, size={size}")
        
        # Read param.sfo (entry 0x1000)
        for eid, off, sz in entries:
            if eid == 0x1000:
                f.seek(off)
                dump_sfo(f.read(sz))

def dump_sfo(data):
    if data[:4] != b'\x00PSF':
        print("Invalid SFO magic")
        return
    key_table_offset, data_table_offset, entry_count = struct.unpack('<III', data[8:20])
    for i in range(entry_count):
        off = 20 + i * 16
        key_off, param_fmt, param_len, param_max_len, data_off = struct.unpack('<HHIII', data[off:off+16])
        key = data[key_table_offset + key_off:].split(b'\x00')[0].decode('utf-8', errors='ignore')
        val_bytes = data[data_table_offset + data_off: data_table_offset + data_off + param_len]
        if param_fmt == 0x0402: # string
            val = val_bytes.decode('utf-8', errors='ignore').rstrip('\x00')
        elif param_fmt == 0x0404: # int
            val = struct.unpack('<I', val_bytes)[0]
        else:
            val = val_bytes.hex()
        print(f"  {key:25} = {val}")

dump_pkg_info(r'C:\Biblioteca_Juegos_PS\God of War (CUSA07408)\GOW_PS4-CUSA07408-[DLPSGAME.COM].pkg')
dump_pkg_info(r'C:\Biblioteca_Juegos_PS\God of War (CUSA07408)\GOW_v1.35.PATCH.PS4-CUSA07408-[DLPSGAME.COM].pkg')
