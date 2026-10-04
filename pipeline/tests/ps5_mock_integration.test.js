/**
 * @file ps5_mock_integration.test.js
 * @description Test de integración end-to-end con servidor mock de PlayStation 5.
 *   Simula los puertos :8084 (Payload Manager) y :12800 (pkg-receiver)
 *   y valida el protocolo de red, detección de degradación y dispatch de comandos.
 * SRP < 200L. Cero dependencias externas (usa node:test y node:http).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

/**
 * Crea un servidor HTTP mock que emula la API del Payload Manager y pkg-receiver de PS5.
 */
function createPs5MockServer() {
  const state = {
    version: '0.5.2',
    config: 'kstuff.elf,elfldr-ps5.elf,pkg-receiver.elf,ftpsrv-ps5.elf,shadowmountplus.elf',
    payloadsLoaded: [],
    installedPkgs: [],
    shouldFail: false,
  };

  const server = http.createServer((req, res) => {
    if (state.shouldFail) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal Error');
      return;
    }

    const url = req.url || '';

    // Emulación :8084 Payload Manager
    if (url === '/version') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(state.version);
    } else if (url === '/get_config') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(state.config);
    } else if (url.startsWith('/loadpayload:')) {
      const payloadName = url.replace('/loadpayload:', '');
      state.payloadsLoaded.push(payloadName);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    }
    // Emulación :12800 pkg-receiver
    else if (url.startsWith('/install?')) {
      const params = new URLSearchParams(url.split('?')[1]);
      const pkgUrl = params.get('url') || '';
      const pkgName = params.get('name') || '';
      state.installedPkgs.push({ url: pkgUrl, name: pkgName });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', message: 'Task created' }));
    } else if (url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ busy: false, pull: false }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  return { server, state };
}

test('PS5 Integration Mock — Comunicación y protocolo con Payload Manager (:8084)', async (t) => {
  const { server, state } = createPs5MockServer();

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  await t.test('1. Consulta versión de WebKit Autoloader', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/version`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.equal(body, '0.5.2');
  });

  await t.test('2. Consulta cadena dorada de autoload', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/get_config`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.match(body, /kstuff\.elf/);
    assert.match(body, /pkg-receiver\.elf/);
  });

  await t.test('3. Inyección en caliente de payload (loadpayload:kstuff.elf)', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/loadpayload:kstuff.elf`);
    assert.equal(res.status, 200);
    assert.ok(state.payloadsLoaded.includes('kstuff.elf'));
  });

  await t.test('4. Inyección de comando de instalación de PKG (:12800)', async () => {
    const testFile = 'CUSA11518_MortalKombat11.pkg';
    const pkgUrl = `http://192.168.2.1:9898/pkg/${encodeURIComponent(testFile)}`;
    const installUrl = `http://127.0.0.1:${port}/install?url=${encodeURIComponent(pkgUrl)}&name=${encodeURIComponent(testFile)}`;

    const res = await fetch(installUrl);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(state.installedPkgs.length, 1);
    assert.equal(state.installedPkgs[0].name, testFile);
    assert.equal(state.installedPkgs[0].url, pkgUrl);
  });

  await t.test('5. Manejo de error cuando PS5 responde 500 (Fail-Closed)', async () => {
    state.shouldFail = true;
    const res = await fetch(`http://127.0.0.1:${port}/version`);
    assert.equal(res.status, 500);
  });

  await new Promise((resolve) => server.close(resolve));
});
