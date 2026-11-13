import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  currentBlock,
  expoSkips,
  renderBlock,
  shipsNativeCode,
} from './dependabot-skip.mjs';

const config = readFileSync(
  new URL('../../.github/dependabot.yml', import.meta.url),
  'utf8',
);

test('the Dependabot skip list matches the installed Expo SDK and native packages', () => {
  assert.equal(
    currentBlock(config),
    renderBlock(),
    'Run node scripts/quality/dependabot-skip.mjs --write',
  );
});

test('the skip list holds Expo pins and native packages, not plain JavaScript ones', () => {
  const skipped = expoSkips();
  for (const name of [
    'expo',
    '@sentry/react-native',
    'react',
    'react-native',
    'react-native-worklets',
    '@react-native-google-signin/google-signin',
  ])
    assert.ok(skipped.includes(name), `${name} should be skipped`);
  for (const name of ['@supabase/supabase-js', '@tanstack/react-query'])
    assert.ok(!skipped.includes(name), `${name} should stay in the batch`);
});

test('the generated entries sit inside the npm ignore list after the major-version rule', () => {
  const npm = config.slice(config.indexOf('package-ecosystem: npm'));
  const ignore = npm.indexOf('    ignore:');
  const major = npm.indexOf('update-types: [version-update:semver-major]');
  assert.ok(ignore >= 0 && ignore < major);
  assert.ok(major < npm.indexOf(currentBlock(config)));
});

test('native code is found by podspec, Expo module config or native folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dependabot-skip-'));
  const make = (name, entry, folder = false) => {
    const pkg = join(dir, name);
    mkdirSync(folder ? join(pkg, entry) : pkg, { recursive: true });
    if (!folder) writeFileSync(join(pkg, entry), '');
    return pkg;
  };
  assert.ok(shipsNativeCode(make('a', 'A.podspec')));
  assert.ok(shipsNativeCode(make('b', 'expo-module.config.json')));
  assert.ok(shipsNativeCode(make('c', 'ios', true)));
  assert.ok(shipsNativeCode(make('d', 'android', true)));
  assert.ok(!shipsNativeCode(make('e', 'index.js')));
});
