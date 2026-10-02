# MANUAL MAESTRO DE JAILBREAK & PIPELINE — PS5 (FW 13.40) & PS4 (FW 12.52)

> **Repositorio de Documentación Técnica Aislada:** `E:\ps5`  
> **Fecha de Consolidación:** 01-OCT-2026 / 02-OCT-2026  
> **Propietario:** Jeiser Gutiérrez (`@jeiserlabs`)

---

## 1. Identificación y Hardware de Consolas

| Consola | Firmware | Estado Jailbreak | Método de Carga | IP LAN Fija | Puertos Activos |
| :--- | :---: | :---: | :--- | :---: | :--- |
| **PlayStation 5** | **13.40** | **Activo** | WebKit Autoloader 0.5.2 + etaHEN / Payload Manager | `192.168.2.2` | • 12800 (DirectPackageInstaller / HTTP Install)<br>• 2121 (ftpsrv FTP Server)<br>• 9021 (elfldr privado) |
| **PlayStation 4** | **12.52** | **Activo** | Jailbreak FPKG / WebKit exploit | DHCP / LAN | • FTP / Remote PKG Installer |
| **PC Host Workstation** | Windows 11 | Servidor LAN Multi-Drive | `node scripts/ps5/server.js` | `192.168.2.1` | • 9898 (Multi-Drive HTTP Server: `C:\Biblioteca_Juegos_PS` + `E:\Biblioteca_Juegos_PS`) |

---

## 2. Arquitectura de Red y Transferencia Directa PC ↔ PS5

- **Conexión Física:** Cable de red Ethernet directo o switch gigabit (LAN dedicada en subred `192.168.2.0/24`).
- **Rendimiento:** ~68 MB/s a 74 MB/s constantes por cable. Transfiere un juego de 40 GB en ~9 a 10 minutos.
- **Flujo de Envío:**
  ```
  PC Host (192.168.2.1:9898) ──[HTTP Pull]──> PS5 (192.168.2.2:12800) ──> Instalación Interna (/user/app)
  ```
- **Comando de Inyección Directa:**
  `http://192.168.2.2:12800/install?url=http://192.168.2.1:9898/pkg/<NOMBRE_PKG>&name=<NOMBRE_PKG>`
- **Consulta de Estado:**
  `http://192.168.2.2:12800/api/status`

---

## 3. WebKit Autoloader 0.5.2 en PS5

- **Ubicación en Consola:** App instalada `WKAL00001` en `/user/app/WKAL00001`.
- **Carga de Payloads:** Sin necesidad de memoria USB tras el arranque inicial. Exploit Relapse con offsets estables hasta 13.60.
- **Acceso:** Icono directo "WebKit Autoloader" en la pantalla de inicio de la PS5. Carga Payload Manager en web UI para levantar etaHEN, ftpsrv y DirectPackageInstaller.

---

## 4. Protocolo y Reglas Estrictas de Instalación de PKGs (Cascada Obligatoria)

1. **UN SOLO PAQUETE A LA VEZ:** DirectPackageInstaller en PS5 colapsa si se envían múltiples paquetes en paralelo.
2. **CASCADA OBLIGATORIA (BASE ➔ UPDATE ➔ DLC):**
   - **Paso 1:** Instalar **ÚNICAMENTE** el paquete `(BASE)` del juego.
   - **Paso 2:** Esperar pacientemente en la PS5 hasta que la notificación marque **"Listo para usar / Instalado"** (barra al 100%).
   - **Paso 3:** Inyectar la actualización `(UPDATE)` y esperar a que complete la instalación.
   - **Paso 4:** Inyectar los `(DLC)` uno por uno.
   - *Causa del Error de Spider-Man:* Enviar un DLC o Update antes de que el archivo Base de 43 GB exista en `/user/app` hace que el sistema operativo de la consola aborte la descarga y arroje error.

---

## 5. Inventario de Juegos y Estado en PS5

### A. Juegos 100% Instalados en PS5 (`/user/app`):
1. **Naruto Shippuden: Ultimate Ninja Storm 4 - Road to Boruto** (`CUSA06210`, 38.08 GB) — Instalado y funcional.
2. **Crash Team Racing Nitro-Fueled** (`CUSA13795`, ~15 GB) — Probado y funcional.
3. **Horizon Zero Dawn Complete Edition** (`CUSA01967`, ~45 GB) — Instalado.
4. **It Takes Two** (`CUSA16742`, ~40 GB) — Instalado.
5. **MLB The Show 24** (`CUSA43942`, ~48 GB Base) — Instalado.
6. **EA Sports FC** (`CUSA57220`, ~45 GB) — Instalado.
7. **Overcooked! All You Can Eat** (`CUSA23464`, ~10 GB) — Instalado.
8. **Unravel Two** (`CUSA10416`, ~5 GB) — Instalado.
9. **A Way Out** (`CUSA08004`, ~20 GB) — Instalado.
10. **Herramientas:** Itemzflow (`ITEMZFLOW`), Homebrew Store, WebKit Autoloader (`WKAL00001`), Payload Manager (`PLDM00001`), DirectPackageInstaller (`PKGS12800`).

### B. Estado de Bibliotecas en PC tras Auditoría y Purga (02-OCT-2026):
- **Purga de archivos no instalados / dañados:**
  - Spider-Man Base (43.4 GB) eliminado (arrojó `CE-107923-2` por corrupción en origen IDM).
  - Horizon Forbidden West (28.7 GB) eliminado (estaba truncado, pedía 71 GB).
  - Updates huérfanos eliminados (GoW Ragnarok 23 GB, GoW 2018 7 GB, Miles Morales 11 GB).
- **Espacio Libre en C:**: **448.83 GB** (+146 GB recuperados).
- **Estrategia en Piedra:** **Flujo 1x1 estricto (Descargar Base ➔ Validar SHA-256 en PC ➔ Inyectar por LAN ➔ Updates/DLCs de la misma fuente)**. Cero updates sin base previa.

---

## 6. Procedimiento Paso a Paso para Transferir Juegos (Sesiones Futuras)

1. Conectar la PS5 a la red LAN (cable Ethernet a la PC o switch).
2. En la PS5: Abrir el navegador o **WebKit Autoloader** ➔ Cargar **etaHEN** y asegurarse de que el servidor de paquetes (puerto 12800) y FTP (puerto 2121) estén activos.
3. En la PC: Iniciar el servidor local:
   ```powershell
   node scripts/ps5/server.js
   ```
4. Enviar el paquete base mediante HTTP GET a la consola:
   ```powershell
   python -c "import urllib.request, urllib.parse; name='[SPSX]-Marvels.Spider.Man-CUSA02299-USA-Game-(6.72+)-PS4.pkg'; url=f'http://192.168.2.1:9898/pkg/{urllib.parse.quote(name)}'; urllib.request.urlopen(f'http://192.168.2.2:12800/install?url={urllib.parse.quote(url)}&name={urllib.parse.quote(name)}')"
   ```
5. Mirar en la pantalla de la PS5 cómo avanza la barra hasta el 100%.
6. Repetir únicamente después con los DLCs o Updates correspondientes.

---

## 7. Catálogo DLPSGAME, Scraper y Auditor de PKGs (`E:\ps5\catalog\`)

Todo el ecosistema de búsqueda y auditoría de juegos está respaldado y aislado en `E:\ps5\catalog\`:

- **Base de Datos Local SQLite:** `E:\ps5\catalog\data\games_catalog.db` (catálogo offline indexado de PS4 y PS5).
- **Scraper de DLPSGAME:** `E:\ps5\catalog\lib\dlps_scraper.js` (extracción y parseo de listas oficiales).
- **Auditor Forense de PKGs:** `E:\ps5\catalog\scripts\audit_ps_pkg.py` (inspección de cabeceras, param.sfo, keystone y compatibilidad).
- **Comandos Directos de Uso:**
  * **Buscar juego en catálogo:**
    ```powershell
    node E:\ps5\catalog\scripts\dlps_catalog.js search "Spider-Man"
    ```
  * **Ver estadísticas del catálogo:**
    ```powershell
    node E:\ps5\catalog\scripts\dlps_catalog.js stats
    ```
  * **Auditar un archivo PKG antes de instalar (Keystone y FW):**
    ```powershell
    python E:\ps5\catalog\scripts\audit_ps_pkg.py "C:\Biblioteca_Juegos_PS\<nombre>.pkg"
    ```

