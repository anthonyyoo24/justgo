import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import yaml from 'js-yaml';
import {
  apiProductionLock,
  auditApiDependencies,
  auditArguments,
} from './audit-api-dependencies.mjs';

const exact = (version) => ({ specifier: version, version });

function fixture() {
  return {
    lockfileVersion: '9.0',
    settings: { autoInstallPeers: true, excludeLinksFromLockfile: false },
    importers: {
      '.': { devDependencies: { tooling: exact('1.0.0') } },
      'apps/api': {
        dependencies: {
          '@justgo/contracts': {
            specifier: 'workspace:*',
            version: 'link:../../packages/contracts',
          },
          'drizzle-orm': {
            specifier: '1.0.0',
            version: '1.0.0(expo-sqlite@1.0.0)(pg@1.0.0)',
          },
          pg: exact('1.0.0'),
          plugin: { specifier: '1.0.0', version: '1.0.0(required@1.0.0)' },
          other: exact('1.0.0'),
          aliased: {
            specifier: 'npm:actual-name@1.0.0',
            version: 'actual-name@1.0.0',
          },
        },
        devDependencies: { tooling: exact('1.0.0') },
      },
      'packages/contracts': { dependencies: { zod: exact('1.0.0') } },
      'apps/mobile': { dependencies: { 'expo-sqlite': exact('1.0.0') } },
    },
    packages: {
      'drizzle-orm@1.0.0': {
        resolution: { integrity: 'drizzle-integrity' },
        peerDependencies: { pg: '*', 'expo-sqlite': '*' },
        peerDependenciesMeta: {
          pg: { optional: true },
          'expo-sqlite': { optional: true },
        },
      },
      'pg@1.0.0': { resolution: { integrity: 'pg-integrity' } },
      'pg-cloudflare@1.0.0': { resolution: { integrity: 'cf-integrity' } },
      'expo-sqlite@1.0.0': { resolution: { integrity: 'sqlite-integrity' } },
      'expo@1.0.0': { resolution: { integrity: 'expo-integrity' } },
      'plugin@1.0.0': {
        resolution: { integrity: 'plugin-integrity' },
        peerDependencies: { required: '1.0.0' },
      },
      'nested@1.0.0': { resolution: { integrity: 'exact-nested-integrity' } },
      'nested@2.0.0': { resolution: { integrity: 'nested-2-integrity' } },
      'other@1.0.0': { resolution: { integrity: 'other-integrity' } },
      'required@1.0.0': { resolution: { integrity: 'required-integrity' } },
      'actual-name@1.0.0': {
        resolution: { integrity: 'exact-alias-integrity' },
      },
      'zod@1.0.0': { resolution: { integrity: 'zod-integrity' } },
      'tooling@1.0.0': { resolution: { integrity: 'tooling-integrity' } },
    },
    snapshots: {
      'drizzle-orm@1.0.0(expo-sqlite@1.0.0)(pg@1.0.0)': {
        optionalDependencies: { 'expo-sqlite': '1.0.0', pg: '1.0.0' },
      },
      'pg@1.0.0': {
        optionalDependencies: {
          'pg-cloudflare': '1.0.0',
          'uninstalled-optional': '1.0.0',
        },
      },
      'pg-cloudflare@1.0.0': { optional: true },
      'expo-sqlite@1.0.0': { dependencies: { expo: '1.0.0' } },
      'expo@1.0.0': {},
      'plugin@1.0.0(required@1.0.0)': {
        dependencies: { nested: '1.0.0', required: '1.0.0' },
      },
      'nested@1.0.0': {},
      'other@1.0.0': { dependencies: { nested: '2.0.0' } },
      'nested@2.0.0': {},
      'required@1.0.0': {},
      'actual-name@1.0.0': {},
      'zod@1.0.0': {},
      'tooling@1.0.0': {},
    },
  };
}

test('audits the exact API runtime, not an optional driver supplied solely by mobile', () => {
  const projected = apiProductionLock(fixture());
  assert.ok(projected.packages['drizzle-orm@1.0.0']);
  assert.ok(projected.packages['pg@1.0.0']);
  assert.ok(projected.packages['pg-cloudflare@1.0.0']);
  assert.equal(projected.packages['expo-sqlite@1.0.0'], undefined);
  assert.equal(projected.packages['expo@1.0.0'], undefined);
  assert.equal(projected.importers['apps/mobile'], undefined);
  assert.equal(projected.packages['tooling@1.0.0'], undefined);
  assert.equal(projected.importers['apps/api'].devDependencies, undefined);
  assert.deepEqual(
    projected.snapshots['drizzle-orm@1.0.0(expo-sqlite@1.0.0)(pg@1.0.0)'],
    { optionalDependencies: {} },
  );
});

test('includes the formerly optional provider when API explicitly adopts it', () => {
  const lock = fixture();
  lock.importers['apps/api'].dependencies['expo-sqlite'] = exact('1.0.0');
  const projected = apiProductionLock(lock);
  assert.ok(projected.packages['expo-sqlite@1.0.0']);
  assert.ok(projected.packages['expo@1.0.0']);
});

test('includes a required peer and an optional dependency the API runtime reaches', () => {
  const projected = apiProductionLock(fixture());
  assert.ok(projected.snapshots['required@1.0.0']);
  assert.ok(projected.snapshots['pg-cloudflare@1.0.0']);
  assert.equal(projected.snapshots['uninstalled-optional@1.0.0'], undefined);
});

test('preserves nested versions, aliases, integrity and workspace runtime dependencies', () => {
  const lock = fixture();
  const projected = apiProductionLock(lock);
  for (const key of [
    'nested@1.0.0',
    'nested@2.0.0',
    'actual-name@1.0.0',
    'zod@1.0.0',
  ])
    assert.deepEqual(projected.packages[key], lock.packages[key]);
  assert.deepEqual(Object.keys(projected.importers), [
    '.',
    'apps/api',
    'packages/contracts',
  ]);
  assert.deepEqual(
    projected.importers['packages/contracts'],
    lock.importers['packages/contracts'],
  );
});

test('resolves scoped dependencies and permits ordinary dependency cycles', () => {
  const lock = fixture();
  lock.importers['apps/api'].dependencies['@scope/service'] = exact('1.0.0');
  lock.packages['@scope/service@1.0.0'] = { resolution: { integrity: 's' } };
  lock.snapshots['@scope/service@1.0.0'] = {
    dependencies: { plugin: '1.0.0(required@1.0.0)' },
  };
  lock.snapshots['nested@2.0.0'] = { dependencies: { other: '1.0.0' } };
  const projected = apiProductionLock(lock);
  assert.ok(projected.packages['@scope/service@1.0.0']);
  assert.ok(projected.packages['plugin@1.0.0']);
});

test('fails closed for missing required dependencies or required peers', () => {
  const missingSnapshot = fixture();
  delete missingSnapshot.snapshots['other@1.0.0'];
  assert.throws(
    () => apiProductionLock(missingSnapshot),
    /Missing locked dependency/,
  );
  const missingPeer = fixture();
  delete missingPeer.snapshots['plugin@1.0.0(required@1.0.0)'].dependencies
    .required;
  assert.throws(
    () => apiProductionLock(missingPeer),
    /Missing locked dependency/,
  );
});

test('fails closed for unsupported locks, invalid links and dependency traversal', () => {
  assert.throws(
    () => apiProductionLock({ ...fixture(), lockfileVersion: '6.0' }),
    /v9/,
  );
  for (const link of [
    'link:../../../outside',
    'link:/outside',
    'link:../../node_modules/expo',
    'link:../../packages/missing',
  ]) {
    const lock = fixture();
    lock.importers['apps/api'].dependencies['@justgo/contracts'].version = link;
    assert.throws(() => apiProductionLock(lock), /Invalid|Missing/, link);
  }
  const nestedLink = fixture();
  nestedLink.snapshots['other@1.0.0'].dependencies.nested = 'link:../x';
  assert.throws(() => apiProductionLock(nestedLink), /Invalid workspace link/);
  const traversal = fixture();
  traversal.importers['apps/api'].dependencies['@scope/..'] = exact('1.0.0');
  assert.throws(() => apiProductionLock(traversal), /Invalid dependency name/);
  const unsupported = fixture();
  unsupported.importers['apps/api'].dependencies.pg.version =
    'https://example.test/pg.tgz';
  assert.throws(() => apiProductionLock(unsupported), /Unsupported/);
});

test('uses ordinary pnpm audit of production dependencies with the low threshold', () => {
  assert.deepEqual(auditArguments, ['audit', '--prod', '--audit-level', 'low']);
});

function manifests() {
  return {
    'apps/api': {
      name: '@justgo/api',
      version: '1.0.0',
      dependencies: Object.fromEntries(
        Object.entries(fixture().importers['apps/api'].dependencies).map(
          ([name, { specifier }]) => [name, specifier],
        ),
      ),
      devDependencies: { tooling: '1.0.0' },
    },
    'packages/contracts': {
      name: '@justgo/contracts',
      version: '1.0.0',
      dependencies: { zod: '1.0.0' },
    },
  };
}

async function sourceFixture(
  manifest = manifests(),
  rootManifest = { name: 'repo', packageManager: 'pnpm@11.28.9' },
) {
  const root = await mkdtemp(path.join(tmpdir(), 'justgo-audit-source-test-'));
  await writeFile(path.join(root, 'pnpm-lock.yaml'), yaml.dump(fixture()));
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify(rootManifest),
  );
  for (const [location, content] of Object.entries(manifest)) {
    await mkdir(path.join(root, location), { recursive: true });
    await writeFile(
      path.join(root, location, 'package.json'),
      JSON.stringify(content),
    );
  }
  return root;
}

test('keeps exact metadata on disk, propagates audit failures and always cleans temporary files', async () => {
  const root = await sourceFixture();
  try {
    for (const outcome of [0, 1, new Error('registry unavailable')]) {
      let auditFolder;
      const operation = auditApiDependencies(root, async (folder) => {
        auditFolder = folder;
        const projected = yaml.load(
          await readFile(path.join(folder, 'pnpm-lock.yaml'), 'utf8'),
        );
        assert.equal(
          projected.packages['actual-name@1.0.0'].resolution.integrity,
          'exact-alias-integrity',
        );
        assert.equal(projected.packages['expo-sqlite@1.0.0'], undefined);
        assert.equal(
          JSON.parse(await readFile(path.join(folder, 'package.json'), 'utf8'))
            .packageManager,
          'pnpm@11.28.9',
        );
        assert.deepEqual(
          yaml.load(
            await readFile(path.join(folder, 'pnpm-workspace.yaml'), 'utf8'),
          ),
          { packages: ['apps/api', 'packages/contracts'] },
        );
        assert.equal(
          JSON.parse(
            await readFile(path.join(folder, 'apps/api/package.json'), 'utf8'),
          ).devDependencies,
          undefined,
        );
        if (outcome instanceof Error) throw outcome;
        return outcome;
      });
      if (outcome instanceof Error)
        await assert.rejects(operation, /registry unavailable/);
      else assert.equal(await operation, outcome);
      await assert.rejects(access(auditFolder), { code: 'ENOENT' });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('refuses to audit without the repository pnpm pin', async () => {
  for (const rootManifest of [
    { name: 'repo' },
    { name: 'repo', packageManager: 'npm@11.16.0' },
    { name: 'repo', packageManager: 'pnpm@latest' },
  ]) {
    const root = await sourceFixture(manifests(), rootManifest);
    try {
      await assert.rejects(
        auditApiDependencies(root, () => {
          throw new Error('must not audit');
        }),
        /must pin pnpm/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('rejects manifest/lock drift without invoking the audit', async () => {
  const drifted = manifests();
  drifted['apps/api'].dependencies.pg = '2.0.0';
  const root = await sourceFixture(drifted);
  try {
    await assert.rejects(
      auditApiDependencies(root, () => {
        throw new Error('must not audit');
      }),
      /Stale lockfile/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
