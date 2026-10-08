# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Filtro de compatibilidad PS4→PS5 basado en evidencia (`pipeline/lib/ps5_compatibility.js`):** niveles `block`/`warn`/`info`; solo `block` impide instalar y exige evidencia local determinista (mismo byte N veces + sin éxito FTP). Enganchado en `lan_installer.installPkg` **antes** de la guarda de espacio (no descarga el PKG) y anotado en `validatePkg` como `info.compatibility` (rechazo solo con `{ enforceCompatibility: true }`, para no invalidar auditorías de biblioteca).
- **Auditoría del filtro contra el ledger real (`npm run ps5:compat`):** parsea `lan_installer.log`, agrupa estancamientos en clusters (±64 MB) y falla si algún título instalado con éxito queda bloqueado. El histograma separa el bug de reentrancia (~3.3 GB) del rechazo real del cliente (13.17 GB), que un "byte dominante" único ocultaba.
- **Verificación de firmware de payloads:** `update_payloads.js` contrasta cada payload con `payloads/compatibility.json` contra `cfg.ps5.firmware` (nuevo, override `PS5_FIRMWARE`) y aborta con `--apply` si alguno no soporta el FW. El SHA256 solo probaba integridad. Añadida la entrada `webkit-autoloader` a la matriz.
- **`VERIFICATION.md`:** evidencia de ejecución (tests, ledger, sonda real a la consola, límites declarados).
- **Hardening y Verificación Criptográfica (`payloads/manifest.json`):** Manifiesto confiable con releaseTag, assetName y SHA256 estricto para cada payload oficial. `--apply` ahora es estrictamente fail-closed (aborta si falta tag, asset o hash).
- **Almacenamiento atómico (`pipeline/lib/installed_store.js`):** Escrituras atómicas con swap de archivos `.tmp` y fallback automático a `.bak` ante JSON corrupto o no-array (`{}` o `null`).
- **Suite de Pruebas Extendida:** Suite sincronizada y verificada en tests 100% verde (incluye path traversal, compatibilidad, mock network, resiliencia atómica y updater criptográfico).

### Fixed
- **Seguridad y Privacidad:** Eliminación de topología interna (`ESTADO_VIVO.md`) del árbol público de Git (custodiado localmente en `.gitignore`).
- **Resiliencia de Observabilidad:** `status.js` sincronizado para usar `loadInstalledList` con recuperación `.bak`.
- **Requisitos reproducibles:** Declaración explícita de Node.js 20+, Python 3.10+ y 7-Zip/WinRAR en `README.md` (eliminada afirmación errónea de Python "opcional").
- **Timeouts de red en Updater:** `fetchJson` y `downloadBuffer` blindados con timeout de 5s y límite máximo de descarga (50 MB).
- **Blocklist de foros del informe externo NO se implementó como bloqueo:** CUSA13323, CUSA07408, CUSA28561, CUSA13795, CUSA16742 y CUSA20499 figuran como "incompatibles" en foros, pero la auditoría FTP demuestra que están instalados y funcionando en FW 13.40. Quedan como anotación informativa (`SCENE_REPORTS`); bloquearlos habría impedido incluso el parche de GoW 2018 que el informe pedía instalar.

## [1.2.0] - 2026-10-04

### Added
- **Multi-part Archive Extraction Tests:** Added `pipeline/tests/archive_extractor.test.js` covering multi-volume detection, extraction tools, and fail-fast scenarios (61/61 tests passing).
- **Firmware Compatibility Matrix:** Added `payloads/compatibility.json` mapping FW versions (7.00 to 13.60, target 13.40) to required payload offsets.
- **Automated Backup Pruning:** Added retention policy to `update_payloads.js` pruning older backups to a max of 5.

### Fixed
- **Archive Extraction Starvation:** Fixed priority inversion bug where incomplete archives (missing subsequent volumes) ran heavy test checks blocking alphabetically later archives. Implemented 50ms fast-fail volume check via `7z l -slt` and fixed cooldown handling in `idm_watcher.js`.
- **PS5 Client Unification:** Eliminated redundant HTTP logic across `lan_installer.js` and `kstuff_watchdog.js`, consolidating on `pipeline/lib/ps5_client.js`.
- **Binary Hardening:** Added `tools/external/` and `*.pdb` to `.gitignore` strictly enforcing zero-binary policy in Git (Rule 15).

## [1.1.0] - 2026-10-04

### Added
- **PS5 Network Mock Integration Tests:** End-to-end test suite (`pipeline/tests/ps5_mock_integration.test.js`) mocking Payload Manager `:8084` and `pkg-receiver` `:12800` protocols and error boundaries.
- **Path Traversal Security Tests:** Dedicated security test suite (`pipeline/tests/path_traversal.test.js`) verifying sanitization against directory traversal and command injection tokens.
- **Automated CI Workflow:** GitHub Actions (`.github/workflows/test.yml`) running the full 51-test suite on Windows environments.
- **Disaster Recovery & Safe Mode Guide:** Section 8 in `BLINDADO_RESTAURACION_PS5.md` detailing PS5 Safe Mode entry, database reconstruction, and strict recovery PUP constraints (FW 13.40 only).
- **Official Security Policy:** `SECURITY.md` defining the local LAN isolation requirement (`192.168.2.0/24`), input sanitization standards, and threat model.
- **Automated Payload Release Checker:** `pipeline/scripts/update_payloads.js` querying official GitHub release APIs and contrasting against local hashes.
- **Browser Cache Backup Tool:** `pipeline/scripts/backup_browser_cache.js` extracting WebKit cache and autoloader state via FTP to prevent exploit loss.
- **Micro-drop Recovery Tool:** `pipeline/scripts/quick_recover.js` to clear transient error codes and resume download queues.
- **Community Standards:** `CONTRIBUTING.md` and `ROADMAP.md` covering anti-debt principles, SRP < 300L, and project milestones.

### Fixed
- Auto-healing against network glitches: `idm_healer.js` now detects process exit and stalled connections, automatically reviving IDM.
- Multi-disk storage balance: `library_organizer.js` proactively distributes extractions between `C:\` and `E:\` based on free NVMe headroom.

## [1.0.0] - 2026-10-03

### Added
- Initial golden state bootstrap and PS5 LAN installer pipeline.
- Golden payload chain: `kstuff.elf`, `elfldr-ps5.elf`, `pkg-receiver.elf`, `ftpsrv-ps5.elf`, `shadowmountplus.elf`.
- WebKit Autoloader v0.5.2 host integration.
- 7-barrier cryptographic PKG audit engine (`pkg_validator.js`).
