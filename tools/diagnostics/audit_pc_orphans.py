import os

lib_dirs = [r'C:\Biblioteca_Juegos_PS', r'E:\Biblioteca_Juegos_PS']

print("=== AUDITORIA DE ARCHIVOS EN BIBLIOTECAS PC ===")

duplicates = []
cod_files = []
temp_files = []
all_pkgs = []

for base_dir in lib_dirs:
    if not os.path.exists(base_dir):
        print(f"Directorio no existe: {base_dir}")
        continue
    for root, dirs, files in os.walk(base_dir):
        for f in files:
            full = os.path.join(root, f)
            sz = os.path.getsize(full)
            name_lower = f.lower()

            # 1. Archivos temporales o descargas incompletas
            if any(name_lower.endswith(ext) for ext in ['.tmp', '.crdownload', '.part', '.aria2', '.downloading']):
                temp_files.append((full, sz))

            # 2. Call of Duty Black Ops 1 y 2
            if any(k in name_lower for k in ['bo1', 'bo2', 'black ops', 'cusa57547', 'cusa57548']):
                cod_files.append((full, sz))

            # 3. Duplicados con sufijo (1), (2), copia, copy
            if ' (' in f and any(f.endswith(f' ({i}).pkg') for i in range(1, 10)):
                duplicates.append((full, sz))

            if name_lower.endswith('.pkg'):
                all_pkgs.append((full, sz, f))

print(f"\n1. Archivos temporales / incompletos: {len(temp_files)}")
for p, s in temp_files:
    print(f"   - {p} ({s / (1024**2):.2f} MB)")

print(f"\n2. Call of Duty Black Ops 1 y 2: {len(cod_files)}")
for p, s in cod_files:
    print(f"   - {p} ({s / (1024**3):.2f} GB)")

print(f"\n3. Duplicados detectados: {len(duplicates)}")
for p, s in duplicates:
    print(f"   - {p} ({s / (1024**2):.2f} MB)")

print(f"\nTotal PKGs analizados: {len(all_pkgs)}")
