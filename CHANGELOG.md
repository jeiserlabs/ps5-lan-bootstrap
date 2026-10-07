# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Watchdog elfldr 9021:** `repairCycle` relanza `elfldr-ps5.elf` y la salud exige 12800+2121+9021; autoload canónico exige kstuff+elfldr+receiver+ftpsrv+shadowmountplus.
- **Audit SSOT:** `audit_full.py` lee `data/cache/ps5/installed_pkgs.json` (fallback legacy raíz).
- **Docs:** ARIA marcado ARCHIVED/WONTFIX (IDM manda en WAN); README sincronizado al conteo real de la suite.
- **Fail-closed real:** `triggerPkgInstall` solo acepta `ok===true`/`status success|ok`; cualquier otro JSON es rechazo (cierra falso positivo `{"message":...}` y escalares).
- **Multipart con ciclo de vida:** extractor distingue `retryable` (partes pendientes, padding `part01→part02`, contigüidad 1..max) y el daemon ya no manda incompletos a `.failed`; Zip Slip recursivo con `realpath`.
- **`7z l` no trata toda falla como retryable (P1):** solo `Missing volume` en stdout/stderr devuelve `retryable: true`; cualquier otro código de salida o `listProc.error` (cabecera RAR corrupta, archivo multipart inválido, 7-Zip roto) es permanente y va a `.failed`. Antes cualquier `status !== 0` se interpretaba como "faltan partes" y un RAR corrupto reintentaba eternamente bloqueando la carpeta.
- **Cleanup parcial ya no se reporta como éxito (P2):** `cleanupArchiveVolumes` retorna `{ ok, deleted, failed }` procesando volumen por volumen (un `unlinkSync` fallido no aborta el resto); `handleArchiveSuccess` propaga el reporte y `processPendingArchives` loguea `quedaron volúmenes sin borrar` en vez de `volúmenes eliminados` cuando `failed.length > 0`.
- **README/CHANGELOG:** sincronizados a 81 tests / 7 suites.

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
