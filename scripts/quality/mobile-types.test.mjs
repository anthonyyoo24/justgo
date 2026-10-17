import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const mobile = fileURLToPath(new URL('../../apps/mobile/', import.meta.url));

test('production mobile types exclude Node/Jest globals while tests retain their own environment', () => {
  const filename = mobile + 'tsconfig.json';
  const config = ts.readConfigFile(filename, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, mobile);
  assert.deepEqual(parsed.options.types, [
    'react',
    'react-native',
    'expo/types',
  ]);
  assert.ok(!parsed.fileNames.some((path) => /\.test\.tsx?$/.test(path)));
  const tests = JSON.parse(
    readFileSync(mobile + 'tsconfig.tests.json', 'utf8'),
  );
  assert.deepEqual(tests.compilerOptions.types, ['jest', 'node']);
  // The independent test program includes the tracked route type cases.
  const parsedTests = ts.parseJsonConfigFileContent(tests, ts.sys, mobile);
  assert.ok(
    parsedTests.fileNames.some((path) =>
      path.endsWith('test-support/journal.ts'),
    ),
  );
  assert.ok(
    parsedTests.fileNames.some((path) =>
      path.endsWith('test-support/route-types.ts'),
    ),
  );
  const virtual = mobile + 'src/AmbientTypesFixture.ts';
  const source = `
    const api: string | undefined = process.env.EXPO_PUBLIC_API_URL;
    void api;
    // @ts-expect-error Node APIs must not leak into the application.
    void __dirname;
    // @ts-expect-error Node Buffer must not leak into the application.
    Buffer.from('private');
    // @ts-expect-error Jest globals belong only to the test program.
    jest.fn();
  `;
  const host = ts.createCompilerHost(parsed.options);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (path, language, onError, shouldCreate) =>
    path === virtual
      ? ts.createSourceFile(path, source, language, true)
      : original(path, language, onError, shouldCreate);
  const program = ts.createProgram([virtual], parsed.options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(
    diagnostics.map((error) =>
      ts.flattenDiagnosticMessageText(error.messageText, '\n'),
    ),
    [],
  );
});
