# VERIFICATION — Filtro de compatibilidad PS4→PS5 + FW de payloads

**Fecha:** 2026-10-07 15:56 (-05:00) · **Node:** v24.18.0 · **HEAD:** `a27a057` (working tree, sin commitear)
**Consola:** PS5 Slim FW 13.40 · LAN 192.168.2.1 ↔ 192.168.2.2 · kstuff 1.11 · Autoloader 0.5.2

Este documento registra **solo lo que se ejecutó y su salida real**. Lo que no se pudo
verificar aparece en la sección de límites, no como aprobado.

---

## 1. Suite de tests (PC, sin consola)

```
$ node pipeline/tests/run_all.js
ℹ tests 108
ℹ suites 10
ℹ pass 108
ℹ fail 0
ℹ duration_ms 716.1304
```

Antes de este cambio: 92/92. Se añaden 16 tests (`pipeline/tests/ps5_compatibility.test.js`)
que cubren bloqueo por evidencia, no-contaminación con la lista de foros, parser del ledger,
clusters de estancamiento y FW de payloads.

## 2. Filtro cruzado contra el ledger real

```
$ npm run ps5:compat        # node pipeline/scripts/compat_audit.js
[CUSA34386]
   ledger: 36 estancamiento(s) | determinista: SÍ | instalado OK: no
      - 3.32 GB ×31 ⚠️ bug de reentrancia del daemon (no es el título)
      - 13.18 GB ×3 ← candidato a rechazo del cliente
      - 3.21 GB ×1 ← candidato a rechazo del cliente
      - 84.96 GB ×1 ← candidato a rechazo del cliente
   veredicto: BLOCK — Rechazo determinista del stack PS5 (13.17 GB) con 326 GB libres.
[CUSA10213]
   ledger: 927 estancamiento(s) | determinista: SÍ | instalado OK: sí
      - 3.32 GB ×887 ⚠️ bug de reentrancia del daemon (no es el título)
   lectura: el determinismo de este título viene de ciclos solapados; NO es rechazo del cliente.
   veredicto: OK
…
✅ Filtro coherente con el ledger: ningún título instalado con éxito está bloqueado.
EXIT=0
```

Punto clave: el histograma por clusters evita el falso positivo que habría producido un
"byte dominante" único (3.31 GB por reentrancia vs 13.17 GB rechazo real).

## 3. Verificación end-to-end por el punto de entrada real (`installPkg`)

PKGs sintéticos estructuralmente válidos (SFO con `TITLE_ID`, 128 KB), `dryRun=true`
(sin red, sin Telegram, sin tocar la consola):

```
CUSA34386 (bloqueado)  -> false    # ⛔ TÍTULO BLOQUEADO … Omitido SIN descargar
CUSA07408 (permitido)  -> true     # GoW 2018, instalado y funcionando en esta consola
CUSA34384 (aviso)      -> true     # descarga US en curso: avisa, NO bloquea
E2E_OK
```

## 4. Verificación de firmware de payloads

```
$ node pipeline/scripts/update_payloads.js
kstuff.elf          v1.11      FW: ✔ Compatible con FW 13.40 (7.00–13.60)
ftpsrv-ps5.elf      v0.21.1    FW: ✔ Compatible con FW 13.40 (7.00–13.60)
shadowmountplus.elf 1.7beta3   FW: ✔ Compatible con FW 13.40 (7.00–13.60)
webkit-autoloader   v0.5.2     FW: ✔ Compatible con FW 13.40 (7.00–13.60)
✅ Chequeo de releases completado.
```

## 5. Sondas read-only contra la PS5 real (timestamps 15:53–15:56)

| Sonda | Salida |
|---|---|
| `GET :12800/api/space` | `{"free":326488031232,"total":937046507520}` → **326.49 GB libres** |
| `GET :12800/api/status` | `{"busy":false,"active":0,"pull":false,"pullPaused":false}` |
| `GET :8084/version` | `0.5.2` |
| `GET :12800/api/version` | `{"build":"20260921-03"}` |
| TCP :2121 (ftpsrv) | `True` |

## 6. Daemon relanzado con el código nuevo

```
ProcessId : 23880   (pidfile data/cache/ps5/daemon.pid = 23880, arrancado 15:45)
$ node pipeline/scripts/daemon.js --status
[PS5 DAEMON] Instalados registrados: 39
[PS5 DAEMON] Planificados este ciclo: 0
[PS5 DAEMON] Retenidos: 2   (DLCs US CUSA34384 esperando la base)
```

Motivo del relanzamiento: el proceso anterior (PID 13036) había cargado el código **previo**
al filtro; un daemon de Node no recarga `require()` en caliente.

## 7. Límites de esta verificación (no aprobado / no ejecutado)

* **No se instaló ningún PKG real** en esta pasada: la biblioteca está vacía salvo los 2 DLCs US
  retenidos y las 2 descargas de IDM siguen en curso. La instalación de GoW Ragnarök US
  (CUSA34384) queda pendiente de que IDM termine; el daemon la disparará solo.
* **No se ejecutó `npm run ps5:watchdog:once`** (recomendación del informe). Decisión
  deliberada: el barrido puede entrar en `repairCycle` (re-inyecta kstuff/elfldr/receiver/SM+ y
  manda Telegram) porque **elfldr :9021 está cerrado a propósito**. Con la consola sana y
  descargas grandes a punto de aterrizar, no se altera el estado de la cadena.
* **No hay tests de FTP** (recomendación del informe). Sigue siendo el hueco de cobertura real:
  `console_state_backup.js` y `backup_browser_cache.js` no tienen mock FTP.
* `kstuff_watchdog` continúa **OFF** (pidfile 20196 obsoleto). El daemon y el server 9898 sí están vivos.
* Los 2 backends de tests anteriores (92/92) fueron verificados en esta misma sesión antes de los cambios.
