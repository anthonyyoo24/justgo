import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { getFileInfo } from 'prettier';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { getRoutes } = require('expo-router/internal/routing');
const appRoot = fileURLToPath(
  new URL('../../apps/mobile/src/app', import.meta.url),
);

function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

const context = () => ({ default: () => null });
context.keys = () =>
  files(appRoot).map((path) => `./${relative(appRoot, path)}`);
const tree = getRoutes(context, {
  ignoreEntryPoints: true,
  importMode: 'async',
  sitemap: false,
  notFound: false,
  skipGenerated: true,
});

test('the installed Router resolves each application URL to exactly one file', () => {
  const urls = [];
  function visit(node, parent = '') {
    const path = `${parent}/${node.route}`;
    if (node.type === 'route' && node.route !== '+not-found')
      urls.push(
        '/' +
          path
            .split('/')
            .filter(
              (part) => part && !/^\(.+\)$/.test(part) && part !== 'index',
            )
            .join('/'),
      );
    for (const child of node.children) visit(child, path);
  }
  visit(tree);
  assert.equal(new Set(urls).size, urls.length, 'duplicate application URL');
  assert.deepEqual(
    urls.sort(),
    [
      '/',
      '/acceptance',
      '/access',
      '/account/devices',
      '/account/keys',
      '/account/recover',
      '/account/sign-in',
      '/account/transfer',
      '/account/troubleshooting',
      '/auth/callback',
      '/challenge',
      '/data',
      '/delete-account',
      '/preview',
      '/progress',
      '/recovery',
      '/reflection',
      '/settings',
      '/success',
      '/welcome',
    ].sort(),
  );
});

test('the root stack declares actual hoisted routes and keeps the access gate first', () => {
  const layout = readFileSync(join(appRoot, '_layout.tsx'), 'utf8');
  const registered = [
    ...layout.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g),
  ].map((match) => match[1]);
  const actual = tree.children
    .filter((node) => node.route !== '+not-found')
    .map((node) => node.route);
  assert.equal(registered[0], 'access');
  assert.equal(new Set(registered).size, registered.length);
  assert.deepEqual([...registered].sort(), actual.sort());
  assert.equal(
    tree.children.some(
      (node) => node.type === 'layout' && node.route === '(challenge)',
    ),
    false,
  );
});

test('the installation preference providers wrap the account and access providers', () => {
  const preferences = [
    'MotionPreferencesProvider',
    'HapticsPreferencesProvider',
  ];
  const renders = [];
  const sourceRoot = join(appRoot, '..');
  for (const path of files(sourceRoot).filter(
    (path) => path.endsWith('.tsx') && !/\.test\.tsx$/.test(path),
  )) {
    const source = ts.createSourceFile(
      path,
      readFileSync(path, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    (function visit(node, ancestors) {
      let inner = ancestors;
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = (
          ts.isJsxElement(node) ? node.openingElement : node
        ).tagName.getText(source);
        renders.push({ file: relative(sourceRoot, path), tag, ancestors });
        inner = [...ancestors, tag];
      }
      ts.forEachChild(node, (child) => visit(child, inner));
    })(source, []);
  }
  const appProviders = renders.filter(({ tag }) => tag === 'AppProvider');
  assert.ok(appProviders.length > 0, 'AppProvider is rendered');
  for (const render of renders.filter(({ tag }) => preferences.includes(tag)))
    assert.equal(
      render.file,
      join('app', '_layout.tsx'),
      `${render.tag} renders only in the root layout, once per installation`,
    );
  for (const tag of preferences)
    assert.equal(
      renders.filter((render) => render.tag === tag).length,
      1,
      `${tag} renders only in the root layout, once per installation`,
    );
  for (const render of appProviders)
    for (const tag of preferences)
      assert.ok(
        render.ancestors.includes(tag),
        `${render.file} renders AppProvider outside ${tag}. Keep ${tag} above AppProvider, because the preference belongs to the installation, not to an account`,
      );
});

test('mobile and CI typechecking generate route types before TypeScript reads them', () => {
  const mobilePackage = JSON.parse(
    readFileSync(new URL('../../apps/mobile/package.json', import.meta.url)),
  );
  const rootPackage = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url)),
  );
  const workflow = readFileSync(
    new URL('../../.github/workflows/ci.yml', import.meta.url),
    'utf8',
  );
  assert.equal(
    mobilePackage.scripts.typecheck,
    'node ../../scripts/quality/generate-route-types.mjs && tsc --noEmit && tsc --project tsconfig.tests.json --noEmit',
  );
  assert.match(rootPackage.scripts.typecheck, /pnpm -r run typecheck/);
  assert.match(rootPackage.scripts['check:static'], /pnpm run typecheck/);
  assert.match(workflow, /run: pnpm run check:static/);
});

test('generated route declarations stay ignored while handwritten source remains checked', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  for (const [path, ignored] of [
    ['apps/mobile/expo-env.d.ts', true],
    ['apps/mobile/.expo/types/router.d.ts', true],
    ['apps/mobile/src/app/access.tsx', false],
    ['apps/mobile/test-support/route-types.ts', false],
  ]) {
    const git = spawnSync(
      'git',
      ['check-ignore', '--quiet', '--no-index', '--', path],
      {
        cwd: root,
      },
    );
    assert.equal(git.status, ignored ? 0 : 1, `Git ignore policy: ${path}`);
    const formatting = await getFileInfo(join(root, path), {
      ignorePath: join(root, '.prettierignore'),
    });
    assert.equal(formatting.ignored, ignored, `Formatting policy: ${path}`);
  }
});
