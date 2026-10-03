import struct

patch_path = r'C:\Biblioteca_Juegos_PS\God of War (CUSA07408)\GOW_v1.35.PATCH.PS4-CUSA07408-[DLPSGAME.COM].pkg'
base_path = r'C:\Biblioteca_Juegos_PS\God of War (CUSA07408)\GOW_PS4-CUSA07408-[DLPSGAME.COM].pkg'

def inspect(p, name):
    print(f"\n=== {name} ===")
    with open(p, 'rb') as f:
        f.seek(0x10)
        entry_count = struct.unpack('>I', f.read(4))[0]
        f.seek(0x18)
        table_offset = struct.unpack('>I', f.read(4))[0]
        f.seek(0x40)
        cid = f.read(36).decode('ascii', errors='ignore')
        f.seek(0x100)
        digest = f.read(32).hex()
        print(f"Content ID: {cid}")
        print(f"Digest at 0x100: {digest}")
        print(f"Table offset: 0x{table_offset:04x}, Entries: {entry_count}")
        f.seek(table_offset)
        for i in range(entry_count):
            entry = f.read(32)
            eid, fn_off, flags1, flags2, offset, size, _, _ = struct.unpack('>IIIIIIII', entry)
            print(f"  Entry 0x{eid:04x}: offset=0x{offset:08x} ({offset:11d}) size=0x{size:08x} ({size:10d})")
            if eid == 0x0400: # target digest table
                cur = f.tell()
                f.seek(offset)
                dt = f.read(min(size, 64))
                print(f"    [0x0400 TARGET DIGEST]: {dt.hex()}")
                f.seek(cur)

inspect(base_path, "BASE")
inspect(patch_path, "PATCH")
