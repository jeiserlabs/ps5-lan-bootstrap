import struct

pkg_path = r'C:\Biblioteca_Juegos_PS\God of War (CUSA07410)\CUSA07410_v1.00_[5.05+]-PS4_OPOISSO893-[DLPSGAME.COM].pkg'
with open(pkg_path, 'rb') as f:
    f.seek(0x10)
    file_count, entry_count = struct.unpack('>II', f.read(8))
    table_offset, entry_data_size = struct.unpack('>II', f.read(8))
    
    f.seek(table_offset)
    print(f"Table offset: {table_offset}, File count: {file_count}")
    max_end = 0
    for i in range(file_count):
        data = f.read(32)
        if len(data) < 32: break
        entry_id, filename_offset, flags1, flags2, offset, size, pad1, pad2 = struct.unpack('>IIIIIIII', data)
        end = offset + size
        if end > max_end: max_end = end
        if i < 15 or end > 37000000000:
            print(f"Entry {i:2d}: id=0x{entry_id:04x}, offset={offset:11d}, size={size:11d}, end={end:11d}")
    print(f"Max end byte across all entries: {max_end}")
