import struct

patch_path = r'C:\Biblioteca_Juegos_PS\God of War (CUSA07408)\GOW_v1.35.PATCH.PS4-CUSA07408-[DLPSGAME.COM].pkg'
base_path = r'C:\Biblioteca_Juegos_PS\God of War (CUSA07408)\GOW_PS4-CUSA07408-[DLPSGAME.COM].pkg'

with open(patch_path, 'rb') as f:
    f.seek(0x2ac0)
    for i in range(37):
        entry = f.read(32)
        eid, _, _, _, offset, size, _, _ = struct.unpack('>IIIIIIII', entry)
        if eid == 0x0408:
            cur = f.tell()
            f.seek(offset)
            d0408 = f.read(min(size, 512))
            print("Entry 0x0408 (first 128 bytes hex):")
            print(d0408[:128].hex())
            f.seek(cur)
        if eid == 0x1008:
            cur = f.tell()
            f.seek(offset)
            print("Changeinfo:")
            print(f.read(size).decode('utf-8', errors='ignore'))
            f.seek(cur)

with open(base_path, 'rb') as f:
    f.seek(0x100)
    print("\nBASE DIGEST (0x100):", f.read(32).hex())
    f.seek(0x2a80)
    for i in range(26):
        entry = f.read(32)
        eid, _, _, _, offset, size, _, _ = struct.unpack('>IIIIIIII', entry)
        if eid == 0x0400:
            f.seek(offset)
            print("BASE 0x0400 digest table (first 64 bytes):", f.read(64).hex())
            break
