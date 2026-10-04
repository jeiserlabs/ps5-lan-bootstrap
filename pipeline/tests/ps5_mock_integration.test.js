/**
 * @file ps5_mock_integration.test.js
 * @description Test de integración end-to-end con servidor mock de PlayStation 5.
 *   Ejecuta el cliente de PRODUCCIÓN (pipeline/lib/ps5_client.js) contra un servidor
 *   mock que emula los puertos :8084 (Payload Manager) y :12800 (pkg-receiver).
 * SRP < 150L.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {
  queryPs5Version,
  queryPs5Autoload,
  injectPayload,
  triggerPkgInstall,
  queryInstallStatus,
} = require('../lib/ps5_client.js');

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

    if (url === '/version') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(state.version);
    } else if (url === '/get_config') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(state.config);
    } else if (url.startsWith('/loadpayload:')) {
      const payloadName = decodeURIComponent(url.replace('/loadpayload:', ''));
      state.payloadsLoaded.push(payloadName);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    } else if (url.startsWith('/install?')) {
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

test('PS5 Integration Mock — Ejecuta cliente de PRODUCCIÓN (ps5_client.js) contra mock', async (t) => {
  const { server, state } = createPs5MockServer();

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const ip = '127.0.0.1';

  await t.test('1. queryPs5Version() consulta y parsea versión de WebKit Autoloader', async () => {
    const version = await queryPs5Version(ip, port);
    assert.equal(version, '0.5.2');
  });

  await t.test('2. queryPs5Autoload() recupera y valida lista dorada', async () => {
    const config = await queryPs5Autoload(ip, port);
    assert.match(config, /kstuff\.elf/);
    assert.match(config, /pkg-receiver\.elf/);
  });

  await t.test('3. injectPayload() inyecta payload en caliente por :8084', async () => {
    const ok = await injectPayload(ip, port, 'kstuff.elf');
    assert.equal(ok, true);
    assert.ok(state.payloadsLoaded.includes('kstuff.elf'));
  });

  await t.test('4. triggerPkgInstall() dispara instalación a :12800 con codificación segura', async () => {
    const testFile = 'CUSA11518_v01.00_[11.00].pkg';
    const pkgUrl = `http://192.168.2.1:9898/pkg/${encodeURIComponent(testFile)}`;
    const result = await triggerPkgInstall(ip, port, pkgUrl, testFile);

    assert.equal(result.ok, true);
    assert.equal(result.data.status, 'success');
    assert.equal(state.installedPkgs[0].name, testFile);
    assert.equal(state.installedPkgs[0].url, pkgUrl);
  });

  await t.test('5. queryInstallStatus() parsea estado de consolidación', async () => {
    const status = await queryInstallStatus(ip, port);
    assert.deepEqual(status, { busy: false, pull: false });
  });

  await t.test('6. Fail-Closed: queryPs5Version() devuelve null si la PS5 responde 500', async () => {
    state.shouldFail = true;
    const version = await queryPs5Version(ip, port);
    assert.equal(version, null);
  });

  await new Promise((resolve) => server.close(resolve));
});
