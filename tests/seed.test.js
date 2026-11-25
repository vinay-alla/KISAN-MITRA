import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSeed } from '../scripts/export-seed.mjs';

// server/seed.json is generated from js/data.js; if they drift, the backend serves stale catalogue data.
test('server/seed.json is up to date with js/data.js (run: node scripts/export-seed.mjs)', () => {
  const onDisk = JSON.parse(readFileSync(new URL('../server/seed.json', import.meta.url), 'utf8'));
  assert.deepEqual(onDisk, JSON.parse(JSON.stringify(buildSeed())));
});
