'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const versioning = require('../../scripts/lib/skill-evolution/versioning');
const health = require('../../scripts/lib/skill-evolution/health');

let passed = 0;
let failed = 0;

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-evolution-storage-'));
  const skillDir = path.join(root, 'skills', 'demo');
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Original\n');
  return { root, skillDir, versionsDir: versioning.getVersionsDir(skillDir) };
}

function test(name, fn) {
  const fixture = createFixture();
  try {
    fn(fixture);
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`  ✗ ${name}: ${error.message}`);
  } finally {
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
}

test('snapshot creation preserves occupied directories and links plus earlier snapshots', fixture => {
  const { root, skillDir, versionsDir } = fixture;
  versioning.createVersion(skillDir);
  fs.mkdirSync(path.join(versionsDir, 'v2.md'));
  fs.writeFileSync(path.join(versionsDir, 'v2.md', 'keep.txt'), 'preserve');
  if (process.platform !== 'win32') {
    fs.symlinkSync(path.join(root, 'missing'), path.join(versionsDir, 'v3.md'));
  }
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Updated\n');
  const snapshot = versioning.createVersion(skillDir);
  assert.equal(snapshot.version, process.platform === 'win32' ? 3 : 4);
  assert.equal(fs.readFileSync(snapshot.path, 'utf8'), '# Updated\n');
  assert.equal(fs.readFileSync(path.join(versionsDir, 'v1.md'), 'utf8'), '# Original\n');
  assert.equal(fs.readFileSync(path.join(versionsDir, 'v2.md', 'keep.txt'), 'utf8'), 'preserve');
  assert.equal(versioning.getEvolutionLog(skillDir, 'amendments').at(-1).version, snapshot.version);
  if (process.platform !== 'win32') {
    assert.ok(fs.lstatSync(path.join(versionsDir, 'v3.md')).isSymbolicLink());
    fs.symlinkSync(path.join(versionsDir, 'v1.md'), path.join(versionsDir, 'v5.md'));
    assert.deepEqual(versioning.listVersions(skillDir).map(entry => entry.version), [1, 4, 5]);
    assert.equal(versioning.getCurrentVersion(skillDir), 5);
  }
});

test('health skips malformed amendment rows while retaining a valid pending proposal', fixture => {
  const { root, skillDir } = fixture;
  versioning.ensureSkillVersioning(skillDir);
  fs.writeFileSync(versioning.getEvolutionLogPath(skillDir, 'amendments'),
    'null\n[]\n42\n{bad}\n{"event":"proposal","status":"pending"}\n');
  const report = health.collectSkillHealth({
    skillsRoot: path.join(root, 'skills'), homeDir: root, now: '2026-03-15T12:00:00.000Z',
  });
  assert.equal(report.skills.find(skill => skill.skill_id === 'demo').pending_amendments, 1);
});

console.log(`Results: Passed: ${passed}, Failed: ${failed}`);
process.exitCode = failed > 0 ? 1 : 0;
