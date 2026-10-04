# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
