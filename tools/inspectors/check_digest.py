import hashlib

pkg_path = r'C:\Biblioteca_Juegos_PS\God of War (CUSA07410)\CUSA07410_v1.00_[5.05+]-PS4_OPOISSO893-[DLPSGAME.COM].pkg'

with open(pkg_path, 'rb') as f:
    f.seek(16128)
    dt = f.read(2362148)

    for test_offset in [13631488, 1000000000, 10000000000, 20000000000, 30000000000, 37000000000, 37514379264]:
        # Test 64KB aligned
        f.seek(test_offset)
        chunk = f.read(65536)
        h = hashlib.sha256(chunk).digest()
        found = dt.find(h) != -1
        print(f"Offset {test_offset:11d} ({test_offset/(1024**3):.2f} GB): Hash in table? {found}")
