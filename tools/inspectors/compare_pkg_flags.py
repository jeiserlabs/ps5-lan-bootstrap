base_path = r'C:\Biblioteca_Juegos_PS\God of War (CUSA07408)\GOW_PS4-CUSA07408-[DLPSGAME.COM].pkg'
patch_path = r'C:\Biblioteca_Juegos_PS\God of War (CUSA07408)\GOW_v1.35.PATCH.PS4-CUSA07408-[DLPSGAME.COM].pkg'

with open(base_path, 'rb') as f:
    f.seek(0)
    b_hdr = f.read(0x80)

with open(patch_path, 'rb') as f:
    f.seek(0)
    p_hdr = f.read(0x80)

print("BASE HDR (first 64 bytes):")
print(b_hdr[:64].hex())
print("PATCH HDR (first 64 bytes):")
print(p_hdr[:64].hex())

print("\nPKG FLAGS:")
print("Base flag at 0x04:", b_hdr[4:8].hex())
print("Patch flag at 0x04:", p_hdr[4:8].hex())
print("Base flag at 0x08:", b_hdr[8:12].hex())
print("Patch flag at 0x08:", p_hdr[8:12].hex())
