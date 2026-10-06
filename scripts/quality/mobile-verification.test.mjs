import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const rootPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url)),
);
const mobilePackage = JSON.parse(
  readFileSync(new URL('../../apps/mobile/package.json', import.meta.url)),
);

function commandFixture(t, executable, source) {
  const directory = mkdtempSync(join(tmpdir(), 'justgo-mobile-verification-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const record = join(directory, 'calls.json');
  writeFileSync(
    join(directory, executable),
    `#!${process.execPath}\n${source}`,
    {
      mode: 0o755,
    },
  );
  const env = {
    ...process.env,
    PATH: `${directory}:${process.env.PATH}`,
    JUSTGO_VERIFICATION_RECORD: record,
  };
  delete env.EXPO_NO_CACHE;
  delete env.EXPO_OFFLINE;
  delete env.EXPO_NO_DEPENDENCY_VALIDATION;
  return { directory, record, env };
}

test('workspace verification stops before building when mobile dependency checks fail', (t) => {
  const fixture = commandFixture(
    t,
    'npm',
    `const fs = require('node:fs');
const path = process.env.JUSTGO_VERIFICATION_RECORD;
const calls = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path)) : [];
const args = process.argv.slice(2);
calls.push(args);
fs.writeFileSync(path, JSON.stringify(calls));
process.exit(args[0] === 'run' && args[1] === 'doctor' ? 17 : 0);
`,
  );
  const result = spawnSync('/bin/sh', ['-c', rootPackage.scripts.check], {
    cwd: fixture.directory,
    env: fixture.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 17, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(fixture.record)), [
    ['run', 'doctor', '-w', '@justgo/mobile'],
  ]);
});

test('mobile doctor refreshes version metadata and preserves a failed validation result', (t) => {
  const fixture = commandFixture(
    t,
    'expo-doctor',
    `require('node:fs').writeFileSync(process.env.JUSTGO_VERIFICATION_RECORD,
  JSON.stringify({ noCache: process.env.EXPO_NO_CACHE,
    offline: process.env.EXPO_OFFLINE, skip: process.env.EXPO_NO_DEPENDENCY_VALIDATION }));
process.exit(19);
`,
  );
  const result = spawnSync('/bin/sh', ['-c', mobilePackage.scripts.doctor], {
    cwd: fixture.directory,
    env: fixture.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 19, result.stderr);
  assert.deepEqual(JSON.parse(readFileSync(fixture.record)), { noCache: '1' });
});
