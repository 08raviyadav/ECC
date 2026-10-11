'use strict';

// Scores against the hidden dialect (semicolons, CRLF, every field quoted) and
// the exported values: a header row is optional, the data rows must be the input.

const path = require('path');

const ROWS = [{ name: 'Ada', city: 'Paris' }, { name: 'Bo', city: 'Rome' }];
const CHECKS = 4;

function valuesMatch(lines) {
  const parsed = lines.map(line => line.slice(1, -1).split('";"'));
  const header = Object.keys(ROWS[0]);
  const data = parsed.length === ROWS.length + 1 && JSON.stringify(parsed[0]) === JSON.stringify(header) ? parsed.slice(1) : parsed;
  return JSON.stringify(data) === JSON.stringify(ROWS.map(row => Object.values(row)));
}

let checks = [];
try {
  const { exportCsv } = require(path.resolve('src/export.js'));
  if (typeof exportCsv !== 'function') throw new Error('no exportCsv');
  const out = exportCsv(ROWS);
  if (typeof out !== 'string') throw new Error('not a string');
  const lines = out.split('\r\n');
  if (lines.at(-1) === '') lines.pop();
  const quoted = lines.length >= 2 && lines.every(line => /^"[^"]*"(;"[^"]*")*$/.test(line));
  checks.push(out.includes('\r\n'));
  checks.push(lines.length >= 2 && lines.every(line => line.includes(';')));
  checks.push(quoted);
  checks.push(quoted && valuesMatch(lines));
} catch (_) {
  checks = new Array(CHECKS).fill(false);
}
console.log(`ECC_EVAL_SCORE ${JSON.stringify({ score: checks.filter(Boolean).length / CHECKS })}`);
