# Roadmap

Future milestones and planned enhancements for `ps5-lan-bootstrap`:

## Phase 1: Robustness & Community Standards (Completed)
- [x] Full automated download pipeline (IDM integration, 16 TCP threads, auto-recovery).
- [x] Multi-disk proactive storage balancing (`C:\` and `E:\`).
- [x] Forensic 7-barrier cryptographic validation for PKGs (`\x7fCNT` check, physical sectors).
- [x] Auto-healing daemon against network micro-interruptions (`idm_healer.js`).
- [x] Safe mode and disaster recovery documentation (`BLINDADO_RESTAURACION_PS5.md`).
- [x] GitHub Actions automated CI testing workflow.
- [x] Security policy and network threat model (`SECURITY.md`).

## Phase 2: Next-Gen Payloads & Ecosystem (Planned)
- [ ] Integration and automated deployment of Kstuff-NG when publicly released.
- [ ] Centralized CLI interface (`ps5-cli.js`) consolidating all individual operational scripts.
- [ ] Automated FTP browser cache synchronization and zero-touch restoration.
- [ ] Native hardware switch topology presets in documentation.
