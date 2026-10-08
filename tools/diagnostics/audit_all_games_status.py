#!/usr/bin/env python3
import ftplib

f = ftplib.FTP()
f.connect('192.168.2.2', 2121, timeout=5)
f.login()

def get_dir_size_and_count(path):
    total = 0
    items = []
    try:
        f.retrlines(f'LIST {path}', items.append)
    except:
        return 0, 0, []
    subdirs = []
    for line in items:
        parts = line.split()
        if len(parts) < 9:
            continue
        name = parts[-1]
        if name in ['.', '..']:
            continue
        if line.startswith('d'):
            subdirs.append(name)
        else:
            try:
                total += int(parts[4])
            except:
                pass
    return total, len(subdirs), subdirs

# Mapping of CUSA to Names
GAME_NAMES = {
    'CUSA02299': "Marvel's Spider-Man",
    'CUSA07408': "God of War 2018",
    'CUSA07995': "A Way Out",
    'CUSA10213': "Horizon Zero Dawn Complete",
    'CUSA13323': "Ghost of Tsushima Director's Cut",
    'CUSA13795': "Crash Team Racing Nitro-Fueled",
    'CUSA16742': "It Takes Two",
    'CUSA17776': "Spider-Man Miles Morales",
    'CUSA23384': "Haven",
    'CUSA28561': "Horizon Forbidden West",
    'CUSA43942': "MLB The Show 24"
}

app_lines = []
f.retrlines('LIST /user/app', app_lines.append)
titles = [l.split()[-1] for l in app_lines if l.split()[-1].startswith('CUSA')]

results = []
for t in sorted(titles):
    app_sz, _, _ = get_dir_size_and_count(f'/user/app/{t}')
    patch_sz, _, _ = get_dir_size_and_count(f'/user/patch/{t}')
    _, dlc_count, dlc_names = get_dir_size_and_count(f'/user/addcont/{t}')
    name = GAME_NAMES.get(t, t)
    results.append({
        'title': t,
        'name': name,
        'app_gb': app_sz / (1024**3),
        'patch_gb': patch_sz / (1024**3),
        'dlcs': dlc_count,
        'dlc_list': dlc_names
    })

f.quit()

print(f"{'#':<3} | {'Juego':<32} | {'CUSA':<10} | {'Base (GB)':<10} | {'Update (GB)':<12} | {'DLCs':<5} | {'Estado':<15}")
print("-" * 95)
for i, r in enumerate(results, 1):
    upd_str = f"{r['patch_gb']:.2f} GB" if r['patch_gb'] > 0.05 else "NO TIENE"
    dlc_str = str(r['dlcs']) if r['dlcs'] > 0 else "0"
    estado = "FULL COMPLETO" if (r['patch_gb'] > 0.05 or r['name'] == 'It Takes Two') and r['dlcs'] >= 0 else "Pendiente Upd"
    if r['name'] == 'God of War 2018':
        estado = f"Base + {r['dlcs']} DLCs (Upd descargando)"
    print(f"{i:<3} | {r['name']:<32} | {r['title']:<10} | {r['app_gb']:<10.2f} | {upd_str:<12} | {dlc_str:<5} | {estado:<15}")
