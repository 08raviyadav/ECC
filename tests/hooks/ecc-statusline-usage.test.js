'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

test('actual statusline usage display is opt-in and leaves provider settings alone', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-statusline-usage-'));
  try {
    const payload = { model: { display_name: 'Claude fixture' }, context_window: { remaining_percentage: 80 },
      rate_limits: { five_hour: { used_percentage: 20, resets_at: Math.floor(Date.now() / 1000) + 3600 } } };
    const render = value => {
      const child = spawnSync(process.execPath, [path.resolve(__dirname, '../../scripts/hooks/ecc-statusline.js')], {
        input: JSON.stringify(payload), encoding: 'utf8', timeout: 5000,
        env: { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: home,
          ECC_STATUSLINE_USAGE: value, ECC_BAR_GLYPHS: 'ascii' },
      });
      assert.equal(child.status, 0, child.stderr);
      return child.stdout;
    };
    assert.equal(render('0').split('\n').length, 1);
    assert.ok(render('1').split('\n').length >= 2);
    assert.match(render('1'), /5h/);
    assert.deepEqual(fs.readdirSync(home), []);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
