/**
 * @file healer_engine.test.js
 * @description Pruebas unitarias para healer_engine.js
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isStalled, hasQueuedTasks, decideHealerAction } = require('../lib/healer_engine');

test('healer_engine — isStalled', () => {
  assert.equal(isStalled([]), true, 'Vacío debe considerarse estancado');
  assert.equal(isStalled(null), true, 'Null debe considerarse estancado');
  assert.equal(isStalled([10, 5, 2]), false, 'Con chunks frescos (<45s) no está estancado');
  assert.equal(isStalled([50, 60, 100]), true, 'Con chunks viejos (>45s) está estancado');
});

test('healer_engine — hasQueuedTasks', () => {
  assert.equal(hasQueuedTasks(''), false);
  assert.equal(hasQueuedTasks(null), false);
  assert.equal(hasQueuedTasks('134 135 136'), true);
  assert.equal(hasQueuedTasks('   134   '), true);
});

test('healer_engine — decideHealerAction', () => {
  // Caso 1: Sin tareas en cola -> IDLE
  assert.equal(decideHealerAction({ hasQueue: false, stalled: true, internetOk: true, timeSinceLastKickSec: 100 }), 'IDLE');

  // Caso 2: Descargando normal -> HEALTHY
  assert.equal(decideHealerAction({ hasQueue: true, stalled: false, internetOk: true, timeSinceLastKickSec: 100 }), 'HEALTHY');

  // Caso 3: Estancado pero sin internet -> WAIT_INTERNET
  assert.equal(decideHealerAction({ hasQueue: true, stalled: true, internetOk: false, timeSinceLastKickSec: 100 }), 'WAIT_INTERNET');

  // Caso 4: Estancado, internet OK, pero en cooldown -> HEALTHY (espera fin de cooldown)
  assert.equal(decideHealerAction({ hasQueue: true, stalled: true, internetOk: true, timeSinceLastKickSec: 30 }, 60), 'HEALTHY');

  // Caso 5: Estancado, internet OK, cooldown superado -> KICK_RESUME
  assert.equal(decideHealerAction({ hasQueue: true, stalled: true, internetOk: true, timeSinceLastKickSec: 75 }, 60), 'KICK_RESUME');

  // Caso 6: Proceso cerrado / muerto -> RESTART_PROCESS inmediato
  assert.equal(decideHealerAction({ hasQueue: true, processAlive: false, stalled: true, internetOk: true, timeSinceLastKickSec: 0 }), 'RESTART_PROCESS');
});

