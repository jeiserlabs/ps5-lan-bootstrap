#!/usr/bin/env python3
"""
audit_full.py — Auditoria completa biblioteca PC <-> consola PS5.

Cruza tres fuentes y reporta por Telegram (--telegram) o stdout:
  1. Disco PC    : PKGs en C:\\Biblioteca_Juegos_PS y E:\\Biblioteca_Juegos_PS
  2. Consola FTP : /user/app (juegos), /user/patch (updates), /user/addcont (DLCs)
  3. Registro    : installed_pkgs_ps5.json del repo

Clasifica por nombre con la misma heuristica que pipeline/lib/pkg_rules.js:
UPDATE > DLC > FIX > FullGame(BASE) > vX.Y>1.0 (UPDATE) > BASE.

Salida:
  - Tabla por titulo (consola): base/update/DLCs instalados vs PC
  - Huecos: listos para instalar, updates pendientes, DLCs huerfanos (sin base)
Uso:
  python scripts/audit_full.py            # stdout
  python scripts/audit_full.py --telegram # stdout + Telegram
"""
import os
import re
import sys
import json
import ftplib
import urllib.request
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PS5_IP = "192.168.2.2"
LIBS = [r"C:\Biblioteca_Juegos_PS", r"E:\Biblioteca_Juegos_PS"]
REGISTRY = os.path.join(ROOT, "installed_pkgs_ps5.json")

RE_UPDATE = re.compile(r"(^|[^a-z])(update|upd)([^a-z]|$)|_patch|patch_|updatev|_a0*[1-9]\d*-|-a0*[1-9]\d*-", re.I)
RE_DLC = re.compile(r"-a0000-|(^|[^a-z])(dlc|addon|seasonpass|season-pass|unlock|deluxe|bonus|expansion)([^a-z]|$)", re.I)
RE_FIX = re.compile(r"(^|[^a-z])fix([^a-z]|$)|_fix|fix_|optionalfix", re.I)
RE_FULLGAME = re.compile(r"fullgame|full\.game", re.I)
RE_VERSION = re.compile(r"v(\d+)\.(\d+)")
RE_TITLE = re.compile(r"[A-Za-z]{4}\d{5}")
RE_CONTENT = re.compile(r"^[A-Z0-9]{16}$")


def classify(fn):
    n = fn.lower()
    if re.search(r"[-_]a0100-", n):
        return "BASE"
    if RE_UPDATE.search(n):
        return "UPDATE"
    if RE_DLC.search(n):
        return "DLC"
    if RE_FIX.search(n):
        return "FIX"
    if RE_FULLGAME.search(n):
        return "BASE"
    v = RE_VERSION.search(n)
    if v and (int(v.group(1)) > 1 or int(v.group(2)) > 0):
        return "UPDATE"
    return "BASE"


def pc_library():
    """{title_id: {'BASE': [...], 'UPDATE': [...], 'DLC': [...], 'FIX': [...]}}"""
    out = {}
    for lib in LIBS:
        if not os.path.isdir(lib):
            continue
        for root, _dirs, files in os.walk(lib):
            for fn in files:
                if not fn.lower().endswith(".pkg"):
                    continue
                m = RE_TITLE.search(fn)
                tid = m.group(0).upper() if m else f"UNKNOWN_{re.sub(r'[^A-Za-z0-9]', '', fn)[:8]}"
                out.setdefault(tid, {}).setdefault(classify(fn), []).append(fn)
    return out


def ftp_names(ftp, path):
    out = []
    try:
        ftp.retrlines(f"LIST {path}", out.append)
    except Exception:
        pass
    return [l.split()[-1] for l in out if len(l.split()) >= 9 and l.split()[-1] not in (".", "..")]


def console_state():
    ftp = ftplib.FTP()
    ftp.connect(PS5_IP, 2121, timeout=8)
    ftp.login()
    games = [n for n in ftp_names(ftp, "/user/app") if n.startswith(("CUSA", "PPSA"))]
    patches = set(ftp_names(ftp, "/user/patch"))
    dlcs = {}
    for d in ftp_names(ftp, "/user/addcont"):
        if d.startswith(("CUSA", "PPSA")):
            dlcs.setdefault(d, 0)
            dlcs[d] += len([n for n in ftp_names(ftp, f"/user/addcont/{d}") if RE_CONTENT.match(n)])
    ftp.quit()
    return games, patches, dlcs


def registry():
    try:
        with open(REGISTRY, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return []


def telegram(msg):
    return False


def main():
    # Windows console cp1252 no puede imprimir emojis/box-drawing
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass
    send = "--telegram" in sys.argv
    pc = pc_library()
    games, patches, dlcs = console_state()
    reg = registry()
    reg_set = set(reg)

    print(f"=== AUDITORIA COMPLETA ({len(pc)} titulos en PC, {len(games)} juegos en consola, {len(reg)} PKGs registrados) ===\n")

    lines = ["<b>🎮 AUDITORIA PS5 — Juegos / Updates / DLCs</b>"]
    gaps, stranded, pending_updates = [], [], []

    for tid in sorted(set(list(games) + list(pc.keys()))):
        on_console = tid in games
        has_patch = tid in patches
        dlc_installed = dlcs.get(tid, 0)
        pc_entry = pc.get(tid, {})
        pc_dlc = len(pc_entry.get("DLC", []))
        pc_upd = len(pc_entry.get("UPDATE", []))
        label = f"{tid}"
        if on_console:
            state = "OK"
            extras = []
            if pc_upd and not has_patch:
                extras.append(f"update pendiente ({pc_upd} en PC)")
                pending_updates.append(tid)
            if pc_dlc > dlc_installed:
                extras.append(f"DLC pendiente ({pc_dlc - dlc_installed})")
                gaps.append((tid, "DLC"))
            state += (" +upd" if has_patch else "") + f" +{dlc_installed} DLC"
            if extras:
                state += " ⚠️ " + ", ".join(extras)
            print(f"[CONSOLA] {label}: {state}")
            lines.append(f"• <code>{tid}</code>: {state}")
        else:
            cats = list(pc_entry.keys())
            filenames = {fn for cat in cats for fn in pc_entry[cat]}
            if filenames & reg_set:
                # PKG sin CUSA en nombre (Naruto PRELUDE, homebrews) ya instalado segun registro
                print(f"[REGISTRO] {label}: instalado segun registro (sin CUSA en nombre)")
                continue
            if "BASE" in cats or "FIX" in cats:
                msg = f"listo para instalar ({', '.join(cats)})"
                gaps.append((tid, "COMPLETO" if "BASE" in cats else "solo FIX"))
                print(f"[PC]      {label}: NO instalado — {msg}")
                lines.append(f"• <code>{tid}</code>: 📥 en PC, sin instalar ({msg})")
            else:
                # solo DLC/FIX sin base en PC ni consola
                stranded.append((tid, cats))
                print(f"[PC]      {label}: SOLO {'/'.join(cats)} sin base (huerfano)")
                lines.append(f"• <code>{tid}</code>: ⚠️ {pc_dlc} DLC huerfanos sin base en PC")

    print(f"\nRESUMEN: juegos consola={len(games)} | listos para instalar={len(set(g for g,_ in gaps))} | "
          f"updates pendientes={len(pending_updates)} | huerfanos={len(stranded)}")
    lines.insert(1, f"<b>Consola:</b> {len(games)} juegos · <b>PC:</b> {len(pc)} títulos")
    if pending_updates:
        lines.append(f"\n⏳ Updates pendientes: {', '.join(pending_updates)}")
    if gaps:
        lines.append("📥 Listos para instalar: " + ", ".join(sorted({g for g, _ in gaps})))
    if stranded:
        lines.append("⚠️ Sin base en PC (re-descargar): " + ", ".join(s for s, _ in stranded))

    if send:
        ok = telegram("\n".join(lines))
        print("\nTelegram:", "ENVIADO" if ok else "NO enviado (revisar .env)")


if __name__ == "__main__":
    main()
