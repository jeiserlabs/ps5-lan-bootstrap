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
- **16 tests nuevos** (`pipeline/tests/ps5_compatibility.test.js`): 108/108 en total, incluida la guarda anti-contaminación que impide bloquear los juegos que la auditoría FTP confirma instalados.
- **Biblioteca PS5 100% Full Completa (12/12 títulos):** God of War Ragnarök (`CUSA34388`) consolidado con Base (90.55 GB) + Update v2.00 (19.56 GB) + 2 DLCs a 113 MB/s; God of War 2018 (`CUSA07408`) con Base + Update 1.34 + 8 DLCs; Ghost of Tsushima (`CUSA13323`) con Base v2.24 + DLC Director's Cut; Haven (`CUSA23384`) v1.06 integrado. 0 pendientes, 0 huérfanos. Consola con >68m uptime.
- **Resolución Forense Crash 3 Minutos:** Purga de 20.8 GB de fragmentos `.dat` corruptos de BGFT en `/user/download` y retiro de etaHEN colapsante; consola estabilizada con cadena dorada minimalista y uptime continuo sin kernel panics.

### Fixed
- **Watchdog elfldr 9021:** `repairCycle` relanza `elfldr-ps5.elf` y la salud exige 12800+2121+9021; autoload canónico exige kstuff+elfldr+receiver+ftpsrv+shadowmountplus.
- **Audit SSOT:** `audit_full.py` lee `data/cache/ps5/installed_pkgs.json` (fallback legacy raíz).
- **Docs:** ARIA marcado ARCHIVED/WONTFIX (IDM manda en WAN); README sincronizado al conteo real de la suite.
- **Fail-closed real:** `triggerPkgInstall` solo acepta `ok===true`/`status success|ok`; cualquier otro JSON es rechazo (cierra falso positivo `{"message":...}` y escalares).
- **Multipart con ciclo de vida:** extractor distingue `retryable` (partes pendientes, padding `part01→part02`, contigüidad 1..max) y el daemon ya no manda incompletos a `.failed`; Zip Slip recursivo con `realpath`.
- **`7z l` no trata toda falla como retryable (P1):** solo `Missing volume` en stdout/stderr devuelve `retryable: true`; cualquier otro código de salida o `listProc.error` (cabecera RAR corrupta, archivo multipart inválido, 7-Zip roto) es permanente y va a `.failed`. Antes cualquier `status !== 0` se interpretaba como "faltan partes" y un RAR corrupto reintentaba eternamente bloqueando la carpeta.
- **Cleanup parcial ya no se reporta como éxito (P2):** `cleanupArchiveVolumes` retorna `{ ok, deleted, failed }` procesando volumen por volumen (un `unlinkSync` fallido no aborta el resto); `handleArchiveSuccess` propaga el reporte y `processPendingArchives` loguea `quedaron volúmenes sin borrar` en vez de `volúmenes eliminados` cuando `failed.length > 0`.
- **README/CHANGELOG:** sincronizados a 81 tests / 7 suites.
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
