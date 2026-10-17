import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { generateRouteTypes } from './generate-route-types.mjs';

function fixture(t) {
  const projectRoot = mkdtempSync(join(tmpdir(), 'justgo-route-types-'));
  t.after(() => rmSync(projectRoot, { recursive: true, force: true }));
  mkdirSync(join(projectRoot, '.expo/types'), { recursive: true });
  const declaration = join(projectRoot, '.expo/types/router.d.ts');
  writeFileSync(declaration, "declare module 'expo-router' { /* stale */ }");
  return { projectRoot, declaration };
}

test('uses the installed Expo CLI in noninteractive mode and requires a fresh declaration', (t) => {
  const { projectRoot, declaration } = fixture(t);
  generateRouteTypes({
    projectRoot,
    run(command, args, options) {
      assert.equal(command, process.execPath);
      assert.match(args[0], /expo[/\\]bin[/\\]cli$/);
      assert.deepEqual(args.slice(1), ['customize', 'tsconfig.json']);
      assert.equal(options.cwd, projectRoot);
      assert.equal(options.env.CI, '1');
      assert.equal(options.timeout, 60_000);
      assert.throws(() => readFileSync(declaration));
      writeFileSync(
        declaration,
        "declare module 'expo-router' { /* fresh */ }",
      );
      return { status: 0 };
    },
  });
  assert.match(readFileSync(declaration, 'utf8'), /fresh/);
});

test('fails when Expo reports success without generating types, despite a stale file', (t) => {
  const { projectRoot } = fixture(t);
  assert.throws(
    () => generateRouteTypes({ projectRoot, run: () => ({ status: 0 }) }),
    /did not generate/,
  );
});

test('rejects an empty or malformed declaration', (t) => {
  const { projectRoot, declaration } = fixture(t);
  for (const contents of ['', 'unrelated output']) {
    assert.throws(
      () =>
        generateRouteTypes({
          projectRoot,
          run: () => {
            writeFileSync(declaration, contents);
            return { status: 0 };
          },
        }),
      /invalid route declaration/,
    );
  }
});

test('preserves failed exits, interrupted generation and process errors', (t) => {
  const { projectRoot } = fixture(t);
  for (const result of [
    { status: 1 },
    { status: null, signal: 'SIGTERM' },
    { status: 0, error: new Error('spawn failed') },
  ])
    assert.throws(
      () => generateRouteTypes({ projectRoot, run: () => result }),
      /generation failed/,
    );
});
