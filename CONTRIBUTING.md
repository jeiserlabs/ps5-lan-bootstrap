# Contributing to ps5-lan-bootstrap

Contributions are welcome! Please follow these engineering guidelines to maintain repository stability and code quality.

## Code Standards
1. **Single Responsibility Principle (SRP):** Keep files under 300 lines of code. Split complex logic into submodules before growing.
2. **Standard Library First:** Prefer Node.js and Python standard libraries over adding third-party dependencies.
3. **Zero Secrets:** Never commit `.env` files, auth tokens, passwords, or IP topology.
4. **Zero Binaries in Git:** No `.elf`, `.pkg`, `.rar`, `.7z`, or executables committed to the repository (Rule 15).
5. **Always Green Tests:** Run `npm test` before committing. All tests must pass cleanly.

## Development Workflow
1. Fork and create a feature branch (`git checkout -b feat/my-improvement`).
2. Implement your changes following minimal abstractions and robust error handling.
3. Verify test coverage: `npm test`.
4. Open a Pull Request with a clear description and rationale.
