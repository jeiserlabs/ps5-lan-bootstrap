import struct

base_path = r'C:\Biblioteca_Juegos_PS\God of War (CUSA07408)\GOW_PS4-CUSA07408-[DLPSGAME.COM].pkg'
patch_path = r'C:\Biblioteca_Juegos_PS\God of War (CUSA07408)\GOW_v1.35.PATCH.PS4-CUSA07408-[DLPSGAME.COM].pkg'

with open(base_path, 'rb') as f:
    f.seek(0x100)
    base_digest = f.read(32).hex()
    f.seek(0x40)
    base_cid = f.read(36).decode('latin1')
    f.seek(0x0c)
    file_count, entry_count = struct.unpack('>II', f.read(8))
    table_offset, _ = struct.unpack('>II', f.read(8))
    print(f"BASE Content ID: {base_cid}")
    print(f"BASE Digest (0x100): {base_digest}")

with open(patch_path, 'rb') as f:
    f.seek(0x100)
    patch_digest = f.read(32).hex()
    f.seek(0x40)
    patch_cid = f.read(36).decode('latin1')
    f.seek(0x0c)
    p_fc, p_ec = struct.unpack('>II', f.read(8))
    p_to, _ = struct.unpack('>II', f.read(8))
    print(f"PATCH Content ID: {patch_cid}")
    print(f"PATCH Digest (0x100): {patch_digest}")
    
    # Check entries in patch to see target base digest
    f.seek(p_to)
    for i in range(p_fc):
        entry = f.read(32)
        if len(entry) < 32: break
        eid, fn_off, flags1, flags2, offset, size, _, _ = struct.unpack('>IIIIIIII', entry)
        # Entry 0x1008 is changeinfo, 0x1000 is sfo, 0x0400 is digest table
        print(f"  Patch Entry 0x{eid:04x} offset={offset} size={size}")
        if eid == 0x0400: # digest table / target digest
            cur = f.tell()
            f.seek(offset)
            data = f.read(min(size, 256))
            print("    Entry 0x0400 hex:", data[:64].hex())
            f.seek(cur)
        if eid == 0x1008:
            cur = f.tell()
            f.seek(offset)
            print("    Changeinfo:", f.read(size).decode('latin1', 'ignore')[:100])
            f.seek(cur)
