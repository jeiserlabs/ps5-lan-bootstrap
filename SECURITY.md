# Security Policy

## Supported Architecture & Scope
`ps5-lan-bootstrap` operates directly within local private networks (LAN) to interface between a PC orchestrator and a PlayStation 5 console running homebrew environments.

## Threat Model & Network Isolation

### 1. Dedicated Point-to-Point Network Mandatory
The homebrew daemons running on the PlayStation 5 (`Payload Manager :8084`, `pkg-receiver :12800`, `ftpsrv :2121`, `elfldr :9021`) do not enforce cryptographic transport-layer authentication.
* **MANDATE:** The PlayStation 5 and the host PC MUST be interconnected either via:
  1. A dedicated Ethernet point-to-point cable.
  2. An isolated subnet/VLAN (e.g., `192.168.2.0/24`).
  3. A dedicated offline gigabit switch.
* **NEVER** expose the PS5 IP or host PC ports (`9898`, `8084`, `12800`, `2121`, `9021`) to public Wi-Fi networks, routers with UPnP enabled, or WAN/Internet port forwarding.

### 2. Path Traversal & Input Sanitization
* All filenames received across the pipeline are strictly sanitized using `path.basename()` and validated against PlayStation PKG specifications (`\x7fCNT` magic header).
* Arbitrary paths or traversal tokens (`..`, `/`, `\`) are stripped or rejected fail-closed.

### 3. Secrets Management
* The host PC orchestrator uses environment files (`.env`) strictly excluded from version control (`.gitignore`).
* Do not commit API tokens, bot tokens, or private network topology to public commits.

## Reporting a Vulnerability
If you discover a security issue or flaw in input sanitization, please open a private GitHub Security Advisory or report via repository channels.
