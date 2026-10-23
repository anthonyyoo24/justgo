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
import {
  apiProductionLock,
  auditApiDependencies,
  auditArguments,
} from './audit-api-dependencies.mjs';

function fixture() {
  return {
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'repo',
        workspaces: ['apps/*', 'packages/*'],
        devDependencies: { tooling: '1.0.0' },
      },
      'apps/api': {
        name: '@justgo/api',
        version: '1.0.0',
        dependencies: {
          '@justgo/contracts': '1.0.0',
          'drizzle-orm': '1.0.0',
          pg: '1.0.0',
          plugin: '1.0.0',
          other: '1.0.0',
          aliased: 'npm:actual-name@1.0.0',
        },
        devDependencies: { tooling: '1.0.0' },
      },
      'packages/contracts': {
        name: '@justgo/contracts',
        version: '1.0.0',
        dependencies: { zod: '1.0.0' },
      },
      'apps/mobile': {
        name: '@justgo/mobile',
        version: '1.0.0',
        dependencies: { 'expo-sqlite': '1.0.0' },
      },
      'node_modules/@justgo/api': { link: true, resolved: 'apps/api' },
      'node_modules/@justgo/contracts': {
        link: true,
        resolved: 'packages/contracts',
      },
      'node_modules/drizzle-orm': {
        version: '1.0.0',
        peerDependencies: { pg: '*', 'expo-sqlite': '*' },
        peerDependenciesMeta: {
          pg: { optional: true },
          'expo-sqlite': { optional: true },
        },
      },
      'node_modules/pg': {
        version: '1.0.0',
        optionalDependencies: {
          'pg-cloudflare': '1.0.0',
          'uninstalled-optional': '1.0.0',
        },
      },
      'node_modules/pg-cloudflare': { version: '1.0.0', optional: true },
      'node_modules/expo-sqlite': {
        version: '1.0.0',
        dependencies: { expo: '1.0.0' },
      },
      'node_modules/expo': { version: '1.0.0' },
      'node_modules/plugin': {
        version: '1.0.0',
        dependencies: { nested: '1.0.0' },
        peerDependencies: { required: '1.0.0' },
      },
      'node_modules/plugin/node_modules/nested': {
        version: '1.0.0',
        integrity: 'exact-nested-integrity',
      },
      'node_modules/other': {
        version: '1.0.0',
        dependencies: { nested: '2.0.0' },
      },
      'node_modules/nested': { version: '2.0.0' },
      'node_modules/required': {
        version: '1.0.0',
        dev: true,
        devOptional: true,
        peer: true,
      },
      'node_modules/aliased': {
        name: 'actual-name',
        version: '1.0.0',
        resolved:
          'https://registry.npmjs.org/actual-name/-/actual-name-1.0.0.tgz',
        integrity: 'exact-alias-integrity',
      },
      'node_modules/zod': { version: '1.0.0' },
      'node_modules/tooling': { version: '1.0.0', dev: true },
    },
  };
}

test('audits the exact API runtime, not an optional driver supplied solely by mobile', () => {
  const projected = apiProductionLock(fixture());
  assert.ok(projected.packages['node_modules/drizzle-orm']);
  assert.ok(projected.packages['node_modules/pg']);
  assert.ok(projected.packages['node_modules/pg-cloudflare']);
  assert.equal(projected.packages['node_modules/expo-sqlite'], undefined);
  assert.equal(projected.packages['node_modules/expo'], undefined);
  assert.equal(projected.packages['apps/mobile'], undefined);
  assert.equal(projected.packages['node_modules/tooling'], undefined);
  assert.equal(projected.packages['apps/api'].devDependencies, undefined);
});

test('includes the formerly optional provider when API explicitly adopts it', () => {
  const lock = fixture();
  lock.packages['apps/api'].dependencies['expo-sqlite'] = '1.0.0';
  const projected = apiProductionLock(lock);
  assert.ok(projected.packages['node_modules/expo-sqlite']);
  assert.ok(projected.packages['node_modules/expo']);
});

test('includes a required peer and cannot hide it behind global dev/peer flags', () => {
  const projected = apiProductionLock(fixture());
  assert.deepEqual(projected.packages['node_modules/required'], {
    version: '1.0.0',
  });
  assert.deepEqual(projected.packages['node_modules/pg-cloudflare'], {
    version: '1.0.0',
  });
});

test('preserves nested versions, aliases, integrity and workspace runtime dependencies', () => {
  const lock = fixture();
  const projected = apiProductionLock(lock);
  for (const location of [
    'node_modules/plugin/node_modules/nested',
    'node_modules/nested',
    'node_modules/aliased',
    'node_modules/zod',
    'node_modules/@justgo/contracts',
  ])
    assert.deepEqual(projected.packages[location], lock.packages[location]);
  assert.deepEqual(projected.workspaces, ['apps/api', 'packages/contracts']);
});

test('resolves package-local and scoped dependencies and permits ordinary dependency cycles', () => {
  const lock = fixture();
  lock.packages['apps/api'].dependencies['@scope/service'] = '1.0.0';
  lock.packages['apps/api/node_modules/@scope/service'] = {
    version: '1.0.0',
    dependencies: { plugin: '1.0.0' },
  };
  lock.packages['node_modules/nested'].dependencies = { other: '1.0.0' };
  const projected = apiProductionLock(lock);
  assert.ok(projected.packages['apps/api/node_modules/@scope/service']);
  assert.ok(projected.packages['node_modules/plugin']);
});

test('fails closed for missing required dependencies or required peers', () => {
  for (const location of ['node_modules/pg', 'node_modules/required']) {
    const lock = fixture();
    delete lock.packages[location];
    assert.throws(() => apiProductionLock(lock), /Missing locked dependency/);
  }
});

test('fails closed for unsupported locks, invalid links and dependency traversal', () => {
  assert.throws(
    () => apiProductionLock({ ...fixture(), lockfileVersion: 2 }),
    /v3/,
  );
  for (const target of [
    '../outside',
    '/outside',
    'C:/outside',
    'packages/../contracts',
    'node_modules/expo',
  ]) {
    const lock = fixture();
    lock.packages['node_modules/@justgo/contracts'].resolved = target;
    assert.throws(() => apiProductionLock(lock), /Invalid/);
  }
  const missing = fixture();
  delete missing.packages['node_modules/@justgo/contracts'];
  assert.throws(() => apiProductionLock(missing), /Missing locked dependency/);
  const traversal = fixture();
  traversal.packages['apps/api'].dependencies['@scope/..'] = '1.0.0';
  assert.throws(() => apiProductionLock(traversal), /Invalid dependency name/);
});

test('uses ordinary npm audit with the low threshold and includes runtime optionals/peers', () => {
  assert.deepEqual(auditArguments, [
    'audit',
    '--workspace',
    '@justgo/api',
    '--package-lock-only',
    '--omit=dev',
    '--include=optional',
    '--include=peer',
    '--include-workspace-root=false',
    '--audit-level=low',
  ]);
});

async function sourceFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'justgo-audit-source-test-'));
  const lock = fixture();
  await writeFile(path.join(root, 'package-lock.json'), JSON.stringify(lock));
  for (const location of ['apps/api', 'packages/contracts']) {
    await mkdir(path.join(root, location), { recursive: true });
    await writeFile(
      path.join(root, location, 'package.json'),
      JSON.stringify(lock.packages[location]),
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
        const projected = JSON.parse(
          await readFile(path.join(folder, 'package-lock.json'), 'utf8'),
        );
        assert.equal(
          projected.packages['node_modules/aliased'].integrity,
          'exact-alias-integrity',
        );
        assert.equal(projected.packages['node_modules/expo'], undefined);
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

test('rejects manifest/lock drift without invoking the audit', async () => {
  const root = await sourceFixture();
  try {
    const manifest = fixture().packages['apps/api'];
    manifest.dependencies.pg = '2.0.0';
    await writeFile(
      path.join(root, 'apps/api/package.json'),
      JSON.stringify(manifest),
    );
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
