/**
 * @file aria_engine.test.js
 * @description Test unitario del cliente JSON-RPC download_engine.js contra mock server.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const downloadEngine = require('../lib/download_engine.js');

function createAriaMockServer() {
  const state = {
    receivedCalls: [],
    shouldFail: false,
  };

  const server = http.createServer((req, res) => {
    if (state.shouldFail) {
      res.writeHead(500);
      res.end('Internal Error');
      return;
    }

    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      try {
        const json = JSON.parse(body);
        state.receivedCalls.push(json);

        // Validar que el token secret viaje en params[0]
        assert.equal(json.params[0], `token:${downloadEngine.RPC_SECRET}`);

        if (json.method === 'aria2.getVersion') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: json.id, result: { version: '1.37.0' } }));
        } else if (json.method === 'aria2.addUri') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: json.id, result: 'gid_test_12345' }));
        } else if (json.method === 'aria2.tellStatus') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: json.id, result: { gid: 'gid_test_12345', status: 'active', completedLength: '1000' } }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ jsonrpc: '2.0', id: json.id, result: 'OK' }));
        }
      } catch (err) {
        res.writeHead(400);
        res.end(err.message);
      }
    });
  });

  return { server, state };
}

test('Aria Engine — Cliente JSON-RPC con Mock Server', async (t) => {
  const { server, state } = createAriaMockServer();
  await new Promise((resolve) => server.listen(downloadEngine.RPC_PORT, '127.0.0.1', resolve));

  await t.test('1. isRpcAlive() verifica que aria2 responda versión', async () => {
    const alive = await downloadEngine.isRpcAlive();
    assert.equal(alive, true);
    assert.equal(state.receivedCalls[0].method, 'aria2.getVersion');
  });

  await t.test('2. addUri() envía URLs con token secret y retorna GID', async () => {
    const res = await downloadEngine.addUri(['https://example.com/test.pkg'], { dir: 'E:\\' });
    assert.equal(res.ok, true);
    assert.equal(res.gid, 'gid_test_12345');
  });

  await t.test('3. tellStatus() consulta estado por GID', async () => {
    const res = await downloadEngine.tellStatus('gid_test_12345');
    assert.equal(res.ok, true);
    assert.equal(res.status.gid, 'gid_test_12345');
    assert.equal(res.status.status, 'active');
  });

  await t.test('4. Fail-closed: maneja error 500 del servidor RPC limpiamente', async () => {
    state.shouldFail = true;
    const res = await downloadEngine.rpcCall('aria2.getVersion');
    assert.equal(res.ok, false);
    assert.match(res.error, /HTTP 500/);
  });

  await new Promise((resolve) => server.close(resolve));
});
