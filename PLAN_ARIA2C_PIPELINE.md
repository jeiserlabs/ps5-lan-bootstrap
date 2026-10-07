# ⛔ ARCHIVED / WONTFIX — PLAN ARIA2C NO VIGENTE (IDM manda en WAN tras fix BSOD RNDIS6, 7-oct-2026)
> Estado: espec historica. No auditar como arquitectura activa. Motor real: IDM (ver ESTADO_VIVO.md). aria2c purgado (sin exe, sin proceso).

# PLAN DE IMPLEMENTACIÓN: PIPELINE AUTÓNOMO ARIA2C (CAVEMAN ULTRA / SPEC)
AUTOR: Claude Opus 4.6 (Thinking - Rol Auditor/Planificador)
FECHA: 2026-10-05T05:55:00-05:00
OBJETIVO: Reemplazar IDM por motor headless `aria2c` + JSON-RPC + renovador Playwright.
CONTRATO: Zero-human-touch, SRP < 300L por módulo, CI verde siempre, fail-closed.

---

## 1. AUDITORÍA PRE-MORTEM (ABOGADO DEL DIABLO FIRST)

| Riesgo Catastrófico | Causa Raíz | Mitigación Obligatoria en Código |
| :--- | :--- | :--- |
| **Falla 1: Error 403 inmediato en aria2c** | AkiraBox valida User-Agent + Cookie de Cloudflare del browser que generó el link. | Resolver debe exportar headers exactos (`User-Agent`, `Cookie`) y pasarlos a `aria2.addUri` / `aria2.changeUri`. |
| **Falla 2: Pérdida de progreso al cambiar URL** | ETag o encabezado de rango no coincide entre tokens viejos y nuevos. | Forzar flag `--continue=true` (`-c`) y `--conditional-get=true`. Mantener archivo `.aria2` intacto. |
| **Falla 3: Congelamiento de HDD mecánico (E:)** | 16 hilos escribiendo chunks pequeños sin búfer causan thrashing brutal en disco mecánico. | Configurar `--disk-cache=64M`, `--file-allocation=falloc` (o `trunc`), y cola estricta `max-concurrent-downloads=1`. |
| **Falla 4: Loop infinito de reintentos en link roto** | El archivo fue eliminado del servidor (404/410 real) y el bot reintenta para siempre. | Límite estricto de intentos: `maxAttempts: 3` en `data/cache/ps5/queue_state.json`. Si supera 3, marcar `status: "failed"` y alertar Telegram. |

---

## 2. ARQUITECTURA MODULAR (SRP < 300L)

```
data/cache/ps5/queue_state.json (SSOT de la cola)
          │
          ▼
[pipeline/lib/aria_client.js] (Cliente JSON-RPC HTTP/WS contra localhost:6800)
          │
          ├── addDownload(url, dir, outName, headers)
          ├── pause / unpause / remove
          ├── changeUri(gid, oldUri, newUri)
          └── getStatus(gid)
          │
          ▼
[pipeline/scripts/aria_pilot.js] (Daemon Orquestador 1x1)
          │
          ├── Supervisa estado cada 10s
          ├── Detecta ERROR 403/410 ──► [pipeline/lib/akira_token_refresher.js]
          │                                  │ (Playwright headless local $0)
          │                                  ▼
          │                            Obtiene nueva URL + Cookies
          │                                  │
          │                            Llama aria_client.changeUri()
          │
          └── Detecta COMPLETE ────────► Dispara [archive_extractor.js] (1x1, 2 hilos)
                                             │
                                             ▼
                                       Verifica \x7fCNT
                                             │
                                             ▼
                                       Organiza en Biblioteca
```

---

## 3. ESPECIFICACIÓN DE ARCHIVOS A CREAR POR MODELO EJECUTOR

### ARCHIVO 1: `tools/aria2c/aria2c.exe`
- Origen: Release oficial GitHub `aria2/aria2` (v1.37.0 Windows 64-bit).
- Ubicación: `E:\ps5\tools\aria2c\aria2c.exe`.
- Configuración de inicio (`tools/aria2c/aria2.conf`):
  ```ini
  enable-rpc=true
  rpc-listen-port=6800
  rpc-listen-all=false
  rpc-allow-origin-all=true
  max-concurrent-downloads=1
  max-connection-per-server=16
  split=16
  min-split-size=10M
  continue=true
  disk-cache=64M
  file-allocation=falloc
  check-certificate=false
  save-session=E:\ps5\data\cache\ps5\aria2.session
  input-file=E:\ps5\data\cache\ps5\aria2.session
  save-session-interval=30
  log=E:\ps5\data\logs\aria2.log
  log-level=notice
  ```

### ARCHIVO 2: `pipeline/lib/aria_client.js` (<150 líneas)
- Responsabilidad única: Wrapper funcional JSON-RPC para comunicarse con `aria2c` en `http://127.0.0.1:6800/jsonrpc`.
- Métodos exportados:
  - `ariaRpc(method, params)`
  - `addDownload({ url, dir, filename, headers })`
  - `changeDownloadUrl(gid, oldUrl, newUrl)`
  - `tellStatus(gid)`
  - `tellActive()`
  - `purgeCompleted()`

### ARCHIVO 3: `pipeline/lib/akira_token_refresher.js` (<160 líneas)
- Responsabilidad única: Automatización Playwright headless para regenerar tokens expirados.
- Entrada: URL base de AkiraBox (ej: `https://akirabox.to/2WVGrrlqGkx7/file`).
- Salida: `{ directUrl, userAgent, cookies }`.
- Mecánica:
  1. Lanza Chromium headless (`chromium.launch({ headless: true })`).
  2. Navega a la página del archivo.
  3. Espera selector del botón de descarga y hace click.
  4. Intercepta la solicitud de red o lee el atributo `href` / respuesta JSON de descarga.
  5. Extrae la URL final firmada con parámetros `expiration`, `t`, `s`, `b`.
  6. Cierra browser y retorna datos limpios.

### ARCHIVO 4: `pipeline/scripts/aria_pilot.js` (<220 líneas)
- Responsabilidad única: Daemon en background que orquesta cola 1x1, monitoreo y transición a extracción.
- Bucle operativo (cada 10 seg):
  1. Verifica que `aria2c.exe` esté vivo; si no, lo spawnea con su config.
  2. Consulta `tellActive()`. Si hay descarga en curso, monitorea velocidad y progreso.
  3. Si la descarga falló con código 403 / token expirado:
     - Llama a `akira_token_refresher.js`.
     - Ejecuta `changeDownloadUrl(gid, oldUrl, newUrl)`.
     - Loguea recuperación exitosa en `data/logs/aria_pilot.log`.
   4. Si no hay descarga activa, lee siguiente ítem `status: "pending"` de `data/cache/ps5/queue_state.json`.
  5. Si una descarga llega a `status: "complete"`:
      - Marca ítem en `data/cache/ps5/queue_state.json` como `completed`.
     - Si es `.rar` multi-volumen, invoca `archive_extractor.js`.
     - Si es `.pkg` directo, valida `\x7fCNT` y mueve a `Biblioteca_Juegos_PS`.
     - Envía notificación Telegram.

---

## 4. ORDEN DE EJECUCIÓN EXACTO (PASO A PASO PARA EJECUTOR)

1. **Paso 1: Finalización IDM Tanda 1**
   - Verificar si `CUSA34384UPD6.05 part2.rar` terminó en IDM.
   - Dejar que `idm_watcher.js` complete la descompresión automática del Update 6.05.
   - Con esto, Tanda 1 (100% de los 8 juegos maestros) queda terminada.

2. **Paso 2: Instalación del motor aria2c**
   - Descargar binario portable `aria2c.exe` a `E:\ps5\tools\aria2c\`.
   - Crear archivo de configuración `E:\ps5\tools\aria2c\aria2.conf`.
   - Test unitario: Levantar `aria2c --conf-path=...` y probar ping RPC con curl/fetch.

3. **Paso 3: Creación de bibliotecas cliente**
   - Escribir `E:\ps5\pipeline\lib\aria_client.js`.
   - Escribir `E:\ps5\pipeline\lib\akira_token_refresher.js`.
   - Tests con Jest/Node assert para verificar respuestas simuladas.

4. **Paso 4: Creación del Daemon Piloto**
   - Escribir `E:\ps5\pipeline\scripts\aria_pilot.js`.
   - Conectar con `data/cache/ps5/queue_state.json` para Tanda 2:
     - Marvel's Spider-Man (2018)
     - Haven
     - Miles Morales
     - Crash Team Racing
     - A Way Out
   - Registrar servicio/proceso en supervisor o startup.

5. **Paso 5: Verificación End-to-End**
   - Lanzar 1 descarga de prueba (Haven ~4.5 GB, la más pequeña).
   - Verificar descarga multi-hilo, preservación de HDD, auto-extracción y auditoría `\x7fCNT`.
   - Confirmar 0 interacción humana requerida.
