/**
 * Tests for tests/lib/helpers/windows-test-env.js
 *
 * Run with: node tests/lib/windows-test-env.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { test, banner, summary } = require('./helpers/mini-test-runner');
const { spawnSync } = require('child_process');
const { withoutShadowingClaude, toRelativeTarPath, resolvePython } = require('./helpers/windows-test-env');

banner('windows-test-env helper');

let passed = 0;
let failed = 0;

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-test-env-'));
const exeDir = path.join(root, 'native-install');
const comDir = path.join(root, 'com-install');
const cmdDir = path.join(root, 'npm-global');
const plainDir = path.join(root, 'tools');
for (const dir of [exeDir, comDir, cmdDir, plainDir]) fs.mkdirSync(dir);
fs.writeFileSync(path.join(exeDir, 'claude.exe'), '');
fs.writeFileSync(path.join(comDir, 'claude.com'), '');
// A .cmd shim cannot shadow a fake .cmd placed earlier on PATH, so it stays.
fs.writeFileSync(path.join(cmdDir, 'claude.cmd'), '');

try {
  if (test('drops PATH entries holding claude.exe or claude.com on Windows', () => {
    const pathValue = [plainDir, exeDir, cmdDir, comDir].join(';');
    assert.strictEqual(withoutShadowingClaude(pathValue, 'win32'), [plainDir, cmdDir].join(';'));
  })) passed++; else failed++;

  if (test('drops empty entries and tolerates a missing PATH on Windows', () => {
    assert.strictEqual(withoutShadowingClaude(`;${plainDir};;`, 'win32'), plainDir);
    assert.strictEqual(withoutShadowingClaude(undefined, 'win32'), '');
  })) passed++; else failed++;

  if (test('leaves PATH untouched off Windows', () => {
    const pathValue = [plainDir, exeDir].join(':');
    assert.strictEqual(withoutShadowingClaude(pathValue, 'linux'), pathValue);
    assert.strictEqual(withoutShadowingClaude(undefined, 'darwin'), '');
  })) passed++; else failed++;

  if (test('names an archive relatively with forward slashes and no drive letter', () => {
    const cwd = path.join(root, 'extract', 'node_modules');
    const archive = path.join(root, 'pkg-1.0.0.tgz');
    const relative = toRelativeTarPath(cwd, archive);
    assert.ok(!relative.includes(':'), `tar reads a colon as host:path: ${relative}`);
    assert.ok(!relative.includes('\\'), `expected forward slashes: ${relative}`);
    assert.strictEqual(path.resolve(cwd, relative), archive);
  })) passed++; else failed++;

  // A probe that runs only the commands listed, as Python 3.
  const probeFor = working => (command, args) => working.includes([command, ...args.slice(0, args.indexOf('-c'))].join(' '));

  if (test('skips a python3 that does not run Python, such as the Microsoft Store alias stub', () => {
    assert.deepStrictEqual(resolvePython({ platform: 'win32', probe: probeFor(['py -3']) }), { command: 'py', prefix: ['-3'] });
    assert.deepStrictEqual(resolvePython({ platform: 'win32', probe: probeFor(['python', 'py -3']) }), { command: 'python', prefix: [] });
    assert.deepStrictEqual(resolvePython({ platform: 'win32', probe: probeFor(['python3']) }), { command: 'python3', prefix: [] });
  })) passed++; else failed++;

  if (test('prefers python3 off Windows', () => {
    assert.deepStrictEqual(resolvePython({ platform: 'linux', probe: probeFor(['python3', 'python']) }), { command: 'python3', prefix: [] });
    assert.deepStrictEqual(resolvePython({ platform: 'darwin', probe: probeFor(['python']) }), { command: 'python', prefix: [] });
  })) passed++; else failed++;

  if (test('returns null when no candidate runs Python 3', () => {
    assert.strictEqual(resolvePython({ platform: 'win32', probe: () => false }), null);
    assert.strictEqual(resolvePython({ platform: 'linux', probe: () => false }), null);
  })) passed++; else failed++;

  if (test('a resolved interpreter actually runs Python 3 here', () => {
    const python = resolvePython();
    if (!python) return;
    const run = spawnSync(python.command, [...python.prefix, '-c', 'import sys; print(sys.version_info[0])'], { encoding: 'utf8' });
    assert.strictEqual(run.status, 0, run.stderr);
    assert.strictEqual(run.stdout.trim(), '3');
  })) passed++; else failed++;
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

summary(passed, failed);
