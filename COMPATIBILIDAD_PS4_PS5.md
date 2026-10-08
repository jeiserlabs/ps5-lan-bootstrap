# Compatibilidad PS4/PS5 (fPKG por LAN) — guía operativa

Consolidado 2026-10-07 a partir de: registro real de instalaciones (`data/logs/lan_installer.log`),
auditoría FTP de la consola, y foros técnicos (kstuff-lite #86/#91, r/PS5_Jailbreak).
Objetivo: **no volver a instalar un CUSA equivocado** y saber de antemano qué va a fallar.

---

## 1. La regla que explica casi todo: REGIÓN / CUSA

El emulador PS4 de la PS5 valida el paquete contra el **Title ID (CUSA) exacto**.
Un mismo juego tiene CUSA distintos por región/edición:

| Juego | CUSA bueno (instaló) | CUSA malo (falló) | Resultado |
|---|---|---|---|
| God of War Ragnarök | **CUSA34384 (US)** | CUSA34386 (EU) | EU muere a los 13.17 GB; US es el objetivo |
| Horizon Zero Dawn | **CUSA10213** (base+update ✓) | CUSA01967 (base) | 01967 se estancó a los 37.88 GB |
| GoW 2018 | **CUSA07408** (base ✓ + 8 DLC ✓) | CUSA07410 (base quedó como stub vacío) | mezclar CUSA deja juegos fantasma |

**Regla:** base, update y DLC deben compartir el **mismo CUSA**.
Si la base es CUSA34384, el update y los DLCs deben ser CUSA34384 (los DLCs EU CUSA34386 quedan retenidos).

## 2. Cascada obligatoria (y por qué)

`BASE → FIX → UPDATE → DLC`. Un UPDATE/DLC sin su base **no instala** (el pipeline lo retiene
automáticamente). El orquestador ordenaba por tamaño y metía DLCs de 0.5 MB antes del UPDATE de
25 GB: corregido con `pkgRules.installPriority()`.

## 3. Códigos y patrones de fallo (con evidencia)

| Síntoma | Causa / código | Qué hacer |
|---|---|---|
| Transferencia muere **siempre en el mismo byte 13 172 211 712 (13.17 GB)** | Rechazo del cliente de la consola (PlayGo/hypervisor) contra ese PKG. Reproducido bit a bit 3× con 326 GB libres → **no es espacio ni red** | Cambiar de CUSA/región. No reintentar el mismo archivo |
| `0x80B2116F` = `SCE_PLAYGO_ERROR_CORE_INVALID_SLOT` | Ruta **programática** (`sceAppInstUtilInstallByPackage` vía HTTP :12800 / DPI) falla aunque el PKG sea válido | Instalar con el **Package Installer de la consola** (Debug Settings → Game → Package Installer) o PKG-Manager :8844 con ruta local |
| `CE-100022-5` al abrir el juego | Instalación completa pero el lanzamiento es rechazado (entitlement/versión) | Revisar que update/base sean del mismo CUSA y versión |
| El update instala y **la consola se apaga al abrir el juego** | Update con `MOD`/`ALL.DLC`/Unlock-All (caso real CUSA11518 MK11 v1.30 ALL.DLC.MOD) | No instalar MODs. `isModBlocked` los bloquea ahora también en el orquestador LAN |
| Update "instala" pero la verificación FTP no lo encuentra | Parche incorrecto para esa base (caso GoW 2018 CUSA07408 v1.35) | Buscar el patch del CUSA/versión correctos |

## 4. Registro real (ledger del pipeline)

**Instalados OK:** CUSA02299 Spider-Man (base+update+4 DLC), CUSA13323 Ghost of Tsushima,
CUSA23384 Haven, CUSA20499 Cuphead (base+update+DLC), CUSA13795 CTR (base+update+3 DLC),
CUSA07408 God of War 2018 (base+8 DLC), CUSA07410 GoW 60fps update, CUSA07995 A Way Out,
CUSA28561 Horizon Forbidden West (base+update+2 DLC), CUSA11518 MK11 LAT (base),
CUSA16742 It Takes Two, CUSA43942 MLB The Show 24 (base+update), CUSA17776 Spider-Man Miles Morales
(base+update), CUSA10213 HZD (base+update), SLUG51851, NPXS39041 Homebrew Store, ITEM00001 Itemzflow.

**Fallos (no reintentar a ciegas):** CUSA34386 base (13.17 GB ×2, 3.3 GB ×7 por bug de reentrancia
del daemon, 84.96 GB por disco lleno), CUSA34384 base/update (intento previo incompleto),
CUSA07408 update v1.35 (×3), CUSA01967 base (37.88 GB), CUSA19035 base (3.99 GB),
CUSA03173 base (rechazado por la auditoría estructural), CUSA11518 update ALL.DLC.MOD (se instaló:
es el que apaga la consola).

## 5. Checklist antes de encolar una descarga

1. ¿Es el CUSA de la **misma región** que la base que voy a instalar? (US por defecto si hay duda).
2. ¿La base está primero? El update/DLC sin base se retiene (no instala).
3. ¿El nombre trae `MOD`, `ALL.DLC`, `UNLOCK-ALL`? → **no** (apaga la consola).
4. ¿El update declara **la misma versión de base** que la del dump? (p. ej. GoW v1.35 sólo para la base que corresponda).
5. Espacio libre ≥ 2× el PKG más grande (la consola copia el PKG completo **antes** de instalar).
6. ¿El juego ya está instalado? El SSOT (`data/cache/ps5/installed_pkgs.json`) puede estar desincronizado
   con la consola: la verdad es la auditoría FTP (`/user/app`, `/user/patch`, `/user/addcont`).

## 6. Filtro automático de compatibilidad (implementado 2026-10-07)

`pipeline/lib/ps5_compatibility.js` es el registro único de compatibilidad. Tres niveles:

| Nivel | ¿Bloquea? | Origen |
|---|---|---|
| `block` | **Sí** (no descarga) | Evidencia local determinista: mismo byte N veces + éxito FTP descartado |
| `warn` | No (avisa) | Evidencia local de fallo NO determinista |
| `info` | No (anota) | Reporte de foro sin verificar |

Estados actuales: **`block` = CUSA34386** (13.17 GB ×3) · `warn` = CUSA01967 (37.88 GB),
CUSA19035 (3.99 GB), CUSA34384 (registro FTP no confirmado tras 100%), CUSA11518 (update MOD).

Puntos de enganche:

* `lan_installer.installPkg()` bloquea **antes** de la guarda de espacio → el PKG no se descarga.
* `pkg_validator.validatePkg()` **anota** `info.compatibility`; solo rechaza con `{ enforceCompatibility: true }`,
  para no invalidar herramientas de auditoría/inventario.
* `npm run ps5:compat` (`compat_audit.js`) cruza el filtro con el ledger real y falla si algún
título **instalado con éxito** quedara bloqueado.

> ⚠️ **Por qué la lista de foros NO bloquea.** El informe de auditoría proponía bloquear
> CUSA13323, CUSA07408, CUSA28561, CUSA13795, CUSA16742 y CUSA20499 por reportes de Tekqart/PSXHAX/GBAtemp.
> La auditoría FTP de esta consola demuestra que **los seis están instalados y funcionando en FW 13.40**.
> Esa tabla vive en `SCENE_REPORTS` como anotación informativa: implementarla como blocklist habría
> bloqueado juegos reales (incluido el parche del propio GoW 2018 que el informe pedía instalar).
> Regla: **un título solo se bloquea con evidencia local reproducible**, y hay un test que lo impone
> (`contradictedSceneReports()`).

## 7. Plan de trabajo acordado

* Fuente de enlaces: base de datos **dlps4** (PS4 para PS5); el usuario encola en IDM y el pipeline instala.
* Daemon `pipeline/scripts/daemon.js` corre en loop: extrae .rar/.zip del Desktop, mueve PKG sueltos a
  la biblioteca e instala en cascada. **No descarga nada.**
* Guardas activas: espacio mínimo (2× PKG), anti-MOD, anti-archivo-en-escritura (IDM), reentrancia,
  cascada por categoría.

## 8. Fuentes

* kstuff-lite issue #86 — `0x80B2116F` en instalación programática (DPI :9090 / HTTP :12800 / ps5upload) mientras el Package Installer normal sí funciona.
* kstuff-lite issue #91 — `CE-100022-5` al lanzar juego instalado (FW 13.20, kstuff 1.11).
* r/PS5_Jailbreak — "Some PS4 pkg files crash console while installing".
* Evidencia local (este repo): logs + auditorías FTP del 2–7 oct 2026.
* Informe de auditoría externo (`ps5-lan-bootstrap`): aportó la lista de foros y la idea del filtro;
  su tabla de CUSA "incompatibles" fue **refutada** por la auditoría FTP y quedó desactivada como bloqueo.
* `VERIFICATION.md` — evidencia de ejecución del filtro (tests, ledger, sonda real a la consola).
