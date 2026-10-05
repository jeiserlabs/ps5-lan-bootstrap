/**
 * @file run_all.js
 * @description Test runner determinista y multiplataforma para Node 20, 22 y 24.
 *   Evita fallos de expansión de globs (*.test.js) en shells de Windows en CI.
 */
'use strict';

const { run } = require('node:test');
const { spec } = require('node:test/reporters');
const fs = require('node:fs');
const path = require('node:path');

const testDir = __dirname;
const files = fs.readdirSync(testDir)
  .filter((f) => f.endsWith('.test.js'))
  .map((f) => path.join(testDir, f));

run({ files })
  .on('test:fail', () => { process.exitCode = 1; })
  .compose(new spec())
  .pipe(process.stdout);
