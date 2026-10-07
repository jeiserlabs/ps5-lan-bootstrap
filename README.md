# PS5 LAN Bootstrap

**Hazle jailbreak a tu PS5 una vez por LAN desde tu PC — y después la consola vive 100% sola: sin PC, sin internet, para siempre.**

> Bootstrap the PS5 jailbreak once over LAN from a PC. After that, the console is fully standalone: no PC, no internet, ever.

Este repo automatiza el montaje completo de un jailbreak **estable y offline** en PS5 (FW 7.00–13.60), con autocuración desde el PC mientras está conectado y una configuración en consola que **sobrevive sola** una vez instalada.

---

## ✨ Qué hace

- **Bootstrap por LAN**: el PC sirve el exploit (DNS+HTTPS local) y los payloads; la consola se configura una sola vez.
- **Autoload en consola**: al abrir la app *WebKit Autoloader* (1 toque), se ejecuta la cadena completa: `kstuff → elfldr → pkg-receiver → ftpsrv → ShadowMountPlus`.
- **Standalone real**: tras el bootstrap no hace falta PC ni internet. Solo un toque por encendido (jailbreak tethered, como toda la escena).
- **Pipeline de juegos**: servidor LAN de PKGs (9898), instalación por HTTP a la consola (12800), FTP (2121), envío de payloads (9021).
- **Watchdog autocurable**: detecta degradación (kstuff pausado, servicios caídos) y la repara en caliente; avisa por Telegram (opcional).
- **Blindaje**: snapshots byte-exactos del estado de la consola + guía de restauración total.

## 📋 Requisitos

| Lado | Qué |
|---|---|
| Consola | PS5 con FW **7.00–13.60** (7.00–12.00 puede además usar Poops 100% offline). **NUNCA 14.xx.** |
| PC | Windows 10/11 · [Node.js 20+](https://nodejs.org) · cable Ethernet (directo o switch) |
| Red | LAN dedicada `192.168.2.0/24` (por defecto: PC `192.168.2.1`, PS5 `192.168.2.2`) |
| Opcional | Python 3.10+ (solo para el host del exploit y las auditorías) · Telegram bot (avisos) |

**Sin dependencias npm.** `git clone` y listo — todo es Node nativo + herramientas del sistema.

## 🚀 Inicio rápido

### 1. Red LAN
- Conecta PC y PS5 por cable Ethernet (directo, o por un switch para que el link siga vivo con el PC apagado).
- PC: IP fija `192.168.2.1`, máscara `255.255.255.0`, sin gateway.
- PS5: Ajustes > Red > configurar **DNS manual `192.168.2.1`**.

### 2. PC
```bash
git clone https://github.com/jeiserlabs/ps5-lan-bootstrap.git
cd ps5-lan-bootstrap

# Firewall (una vez; subred del cable solamente) — requiere admin
netsh advfirewall firewall add rule name="PS5 Autoloader DNS"   dir=in action=allow protocol=UDP localport=53  remoteip=192.168.2.0/24
netsh advfirewall firewall add rule name="PS5 Autoloader HTTPS" dir=in action=allow protocol=TCP localport=443 remoteip=192.168.2.0/24

# Levantar todo (servidor LAN + watchdog + host del exploit) — idempotente
powershell -NoProfile -ExecutionPolicy Bypass -File pipeline/scripts/ps5_pc_autostart.ps1
```

### 3. Consola (una sola vez)
1. **Desactiva las actualizaciones automáticas** (Ajustes > Sistema).
2. Abre **Ajustes > Guía y avisos > Guía del usuario** → carga el instalador del exploit (servido por el PC) → la consola se reinicia.
3. Aparecen **WebKit Autoloader** y **Payload Manager** en el inicio. Ábrelas y espera las notificaciones de la cadena de payloads.

### 4. Verificar
```bash
npm run ps5:status          # estado unificado
npm run ps5:watchdog:once   # 1 barrido de salud (8084/12800/2121/9021)
```

### 5. Listo — standalone
Desconecta la PS5 del PC cuando quieras: **la consola ya no lo necesita**. En cada encendido, un toque en **WebKit Autoloader** y a jugar.

> ⚠️ **Nunca borres los datos/cookies del navegador** de la consola: ahí vive la página cacheada del exploit. Recuperación: `BLINDADO_RESTAURACION_PS5.md`.

## 🏗️ Arquitectura

```
  BOOTSTRAP (una vez)                    DÍA A DÍA (standalone)
  ┌─────────┐ DNS+HTTPS  ┌─────────┐     ┌─────────┐
  │   PC    │───────────▶│   PS5   │     │   PS5   │
  │ :53/:443│  instalar  │WKAL00001│     │ Autoloader (1 toque)
  │ :9898   │  app       │         │     │   └─ Relapse (kernel)
  │ watchdog│            └─────────┘     │        └─ cadena autoload:
  └─────────┘                            │           kstuff · elfldr(9021)
       ▲ solo para instalar juegos       │           pkg-receiver(12800)
       └─ o empujar payloads             │           ftpsrv(2121) · SM+
                                         └─────────┘  SIN PC · SIN INTERNET
```

## 🎮 Firmwares soportados

| FW | Entrada | Kernel | Jugar FPKG |
|---|---|---|---|
| 7.00–13.60 | WebKit Autoloader (**este repo**) | Relapse | ≤11.60 (kstuff) · 12.xx+ vía imágenes .exfat + SM+ |
| 7.00–12.00 | WebKit Autoloader con **Poops** | Poops | igual — y **100% offline** (ni red necesita) |
| < 7.00 | Página PSFree/UMTX auto-alojada | UMTX2 | vía guía alternativa (`BLINDADO_RESTAURACION_PS5.md` §4) |

**Elige siempre el FW más bajo posible. No existe downgrade. El 14.00+ parchea todo esto.**

## 🧰 Comandos

| Comando | Qué hace |
|---|---|
| `npm run ps5:status` | Estado unificado (consola, puertos, cola) |
| `npm run ps5:watchdog` | Watchdog del jailbreak (loop 60 s, autocuración) |
| `npm run ps5:watchdog:once` | Un barrido de salud |
| `npm run ps5:backup` | Snapshot byte-exacta del estado de la consola |
| `npm run ps5:server` | Servidor LAN de PKGs (9898) |
| `npm run ps5:send-elf -- x.elf` | Empujar un payload por elfldr (9021) |
| `npm run ps5:daemon` / `ps5:aria-pilot` | Instalación/descargas automatizadas |
| `npm test` | Suite de tests (81 tests / 7 suites, cero dependencias) |

## 📦 Payloads incluidos (SHA256 verificados)

| Payload | Origen | Puerto |
|---|---|---|
| kstuff 1.11 | [EchoStretch/kstuff-lite](https://github.com/EchoStretch/kstuff-lite) | — |
| elfldr 0.26 | [ps5-payload-dev](https://github.com/ps5-payload-dev/elfldr) | 9021 |
| pkg-receiver | escena | 12800 |
| ftpsrv 0.21.1 | [ps5-payload-dev](https://github.com/ps5-payload-dev/ftpsrv) | 2121 |
| ShadowMountPlus 1.7b3 | drakmor | 10101 (local) |

Binarios en `payloads/` y `ps5-host/` (gitignored por diseño). Hashes y URLs oficiales: [`BLINDADO_RESTAURACION_PS5.md`](BLINDADO_RESTAURACION_PS5.md).

## 🔧 Si algo falla

| Síntoma | Fix rápido |
|---|---|
| La consola no tiene jailbreak tras encender | ¿Interfaz de red activa? (Relapse la exige) → abrir **WebKit Autoloader** |
| En pantalla: `[relapse] [-] kaslr: no interface has an address` | La consola se quedó **sin interfaz con IP** (cable desconectado o PC apagada). Reconectar cable a la PC encendida (o Wi-Fi con DNS manual `192.168.2.1`) y pulsar **△ Volver a cargar**. No hace falta reiniciar |
| El Autoloader no carga la página | Host del PC vivo (TCP 443 en 192.168.2.1) · DNS manual en la consola · **NO borrar datos del navegador** |
| Juegos no arrancan a media sesión | `npm run ps5:watchdog:once` (repara en caliente) · revisar `kstuff_game_auto_toggle=0` en `/data/shadowmount/config.ini` |
| Consola sin jailbreak persistente | Normal: es tethered. 1 toque por encendido |
| Recuperación total / otra consola | [`BLINDADO_RESTAURACION_PS5.md`](BLINDADO_RESTAURACION_PS5.md) — Escenarios A y B |

## 📚 Documentación profunda

- [`BLINDADO_RESTAURACION_PS5.md`](BLINDADO_RESTAURACION_PS5.md) — restauración total y replicación en otra PS5
- [`AUDIT_Y_PREMORTEM_PS5_2026-10-03.md`](AUDIT_Y_PREMORTEM_PS5_2026-10-03.md) — auditoría de estabilidad, premortem y runbook
- [`pipeline/PS5_PIPELINE.md`](pipeline/PS5_PIPELINE.md) — pipeline de juegos en detalle
- [`HISTORIAL-JAILBREAK-PS5.md`](HISTORIAL-JAILBREAK-PS5.md) — bitácora completa de la escena y decisiones
- [`MANUAL_MAESTRO_PS5_Y_PS4_JAILBREAK.md`](MANUAL_MAESTRO_PS5_Y_PS4_JAILBREAK.md) — manual operativo extendido

## ⚠️ Aviso

Proyecto de investigación y homebrew, tal cual, sin garantías. Úsalo bajo tu propio riesgo: modificar el firmware puede dañar la consola y **actualizarla te cierra la puerta para siempre**. Este repo no distribuye software con copyright ni fomenta la piratería: los payloads referenciados pertenecen a sus autores.

## 🙏 Créditos

**itsPLK** (WebKit Autoloader) · **ntfargo** (Relapse) · **EchoStretch** (kstuff) · **ps5-payload-dev** (ftpsrv/elfldr) · **drakmor** (ShadowMountPlus/FPKG) · **sleirsgoevy, flatz, zecoxao, idlesauce, buzzer-re, Al-Azif, ufm42** y toda la escena de PS5.

Hecho con 🤖 por [@jeiserlabs](https://github.com/jeiserlabs).
