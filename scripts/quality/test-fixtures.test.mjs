import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtureRoots = [
  'apps/mobile/test-support/progress',
  'apps/mobile/test-support/identity',
  'apps/api/tests/identity/fixtures',
  'apps/api/tests/db/fixtures',
];
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(path.join(directory, entry.name))
      : [path.join(directory, entry.name)],
  );
}

test('split test fixtures retain resolvable imports, Jest factories and resource URL bases', () => {
  for (const filename of fixtureRoots
    .flatMap((directory) => files(path.join(root, directory)))
    .filter((filename) => /\.tsx?$/.test(filename))) {
    const source = ts.createSourceFile(
      filename,
      readFileSync(filename, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      filename.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    function visit(node) {
      if (ts.isStringLiteralLike(node) && node.text.startsWith('.')) {
        const parent = node.parent;
        const module =
          ts.isImportDeclaration(parent) ||
          ts.isExportDeclaration(parent) ||
          (ts.isCallExpression(parent) &&
            parent.arguments[0] === node &&
            ts.isPropertyAccessExpression(parent.expression) &&
            ['mock', 'requireActual', 'requireMock'].includes(
              parent.expression.name.text,
            ));
        const resource =
          ts.isNewExpression(parent) &&
          parent.expression.getText() === 'URL' &&
          parent.arguments?.[1]?.getText() === 'import.meta.url';
        const target = path.resolve(path.dirname(filename), node.text);
        if (module)
          assert.ok(
            [
              target,
              target + '.ts',
              target + '.tsx',
              target.replace(/\.js$/, '.ts'),
              target.replace(/\.js$/, '.tsx'),
            ].some(existsSync),
            `${filename}: unresolved ${node.text}`,
          );
        if (resource) {
          const url = new URL(node.text, pathToFileURL(filename));
          assert.ok(
            existsSync(url),
            `${filename}: missing resource ${node.text}`,
          );
          if (statSync(url).isDirectory())
            assert.ok(
              node.text.endsWith('/'),
              `${filename}: directory URL must retain its trailing slash`,
            );
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
});

test('the database command still selects every split identity integration suite', () => {
  const script = JSON.parse(
    readFileSync(path.join(root, 'apps/api/package.json'), 'utf8'),
  ).scripts['test:db'];
  const suites = readdirSync(path.join(root, 'apps/api/tests/identity')).filter(
    (name) => /^identity\..+\.integration\.test\.ts$/.test(name),
  );
  assert.ok(
    suites.length > 1,
    'Identity integration stays split by responsibility',
  );
  for (const suite of suites)
    assert.ok(
      script.includes(`tests/identity/${suite}`),
      `Database gate omits ${suite}`,
    );
  assert.ok(!script.includes('tests/identity/identity.integration.test.ts'));
});
