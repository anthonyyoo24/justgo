import assert from 'node:assert/strict';
import test from 'node:test';
import { recoveryLockPlan } from './recovery-fence.mjs';
import {
  connectedLeaseStatement,
  inspectConnectedLease,
  releaseConnectedLease,
  recoveryCatalogQuery,
} from './recovery-source-lease.mjs';

const relations = [
  'auth.refresh_tokens',
  'auth.schema_migrations',
  'auth.sessions',
  'auth.users',
  'drizzle.__drizzle_migrations',
  'justgo.users',
].map((n, i) => ({
  schema: n.split('.')[0],
  name: n.split('.')[1],
  oid: i + 1,
  kind: 'r',
  inherited: false,
}));
const expected = {
  source: 'reviewed-staging/postgres',
  database: 'postgres',
  role: 'postgres',
  compatibilitySha256: 'a'.repeat(64),
  relations,
};
const ready = [123, 456],
  stop = [789, 321],
  catalogSha256 = 'b'.repeat(64);
const failure = {
  message: 'Connected recovery lease invalid; keep target closed',
};
function fixture(change) {
  let reads = 0;
  const calls = [];
  const marker = {
    pid: 100,
    virtualtransaction: '4/29',
    usename: 'postgres',
    observer_database: 'postgres',
    observer_isolation: 'read committed',
    checked_at: new Date(),
    locks: recoveryLockPlan(expected).map((r) => ({
      oid: r.oid,
      mode: r.mode,
    })),
  };
  const catalog = { catalog_sha256: catalogSha256, relations };
  return {
    calls,
    marker,
    catalog,
    client: {
      query: async (sql, parameters) => {
        calls.push([sql, parameters]);
        if (sql === recoveryCatalogQuery) {
          change?.(marker, catalog, 'catalog');
          return { rows: [catalog] };
        }
        reads++;
        change?.(marker, catalog, reads);
        return { rows: marker.missing ? [] : [structuredClone(marker)] };
      },
    },
  };
}

test('single statement uses the same reviewed lock scope and bounded operator/metadata/marker checks', () => {
  const sql = connectedLeaseStatement(expected, { ready, stop, catalogSha256 });
  for (const r of recoveryLockPlan(expected))
    assert.ok(sql.includes(r.sql + ';'));
  assert.ok(
    sql.indexOf('pg_try_advisory_xact_lock(123,456)') >
      sql.lastIndexOf('lock table only'),
  );
  assert.ok(sql.includes('45000 milliseconds'));
  assert.ok(sql.includes("'50000ms'"));
  assert.ok(
    sql.includes(
      "current_setting('transaction_isolation') <> 'read committed'",
    ),
  );
  assert.ok(sql.includes('is distinct from'));
  assert.ok(sql.includes('pg_sleep(0.05)'));
  assert.equal(
    (sql.match(/Recovery source compatibility changed/g) ?? []).length,
    3,
  );
  assert.ok(!/create role|grant |create function|security definer/i.test(sql));
});

test('identifier order matches PostgreSQL C collation rather than English punctuation rules', () => {
  const plan = recoveryLockPlan({
    ...expected,
    relations: [
      ...relations,
      {
        schema: 'auth',
        name: 'a_b',
        oid: 70,
        kind: 'r',
        inherited: false,
      },
      {
        schema: 'auth',
        name: 'a0',
        oid: 71,
        kind: 'r',
        inherited: false,
      },
    ],
  });
  const names = plan.map((r) => r.name);
  assert.ok(names.indexOf('a0') < names.indexOf('a_b'));
  assert.ok(
    recoveryCatalogQuery.includes(
      'n.nspname collate "C",c.relname collate "C"',
    ),
  );
});

test('invalid markers, scope, injection, bounds and hash fail before producing executable SQL', async (t) => {
  for (const [i, options] of [
    { ready: [0, 1] },
    { ready: [1.1, 2] },
    { ready: [1, 2147483648] },
    { stop: ready },
    { catalogSha256: 'private invalid hash' },
    { timeoutMs: 100 },
    { timeoutMs: 45001 },
  ].entries())
    await t.test(`invalid ${i}`, () =>
      assert.throws(() =>
        connectedLeaseStatement(expected, {
          ready,
          stop,
          catalogSha256,
          ...options,
        }),
      ),
    );
  assert.throws(() =>
    connectedLeaseStatement(
      { ...expected, database: "postgres';select 1" },
      { ready, stop, catalogSha256 },
    ),
  );
});

test('observer checks all locks and fresh catalog between two pinned marker reads', async () => {
  const f = fixture();
  const result = await inspectConnectedLease(
    f.client,
    expected,
    ready,
    catalogSha256,
  );
  assert.equal(result.writersMayOpen, false);
  assert.equal(result.pid, 100);
  assert.equal(f.calls.length, 3);
  assert.equal(f.calls[1][0], recoveryCatalogQuery);
  assert.ok(f.calls[0][0].includes('relation::bigint'));
  await inspectConnectedLease(f.client, expected, ready, catalogSha256, result);
});

test('wrong backend, isolation, inventory, catalog and lease loss cannot produce acceptance', async (t) => {
  const mutations = [
    (m) => {
      m.usename = 'justgo_runtime';
    },
    (m) => {
      m.pid = undefined;
    },
    (m) => {
      m.observer_database = 'other';
    },
    (m) => {
      m.observer_isolation = 'repeatable read';
    },
    (m) => {
      m.locks = [];
    },
    (m) => {
      m.virtualtransaction = '-1/0';
    },
    (m, c, step) => {
      if (step === 'catalog') c.catalog_sha256 = 'c'.repeat(64);
    },
    (m, c, step) => {
      if (step === 'catalog') c.relations = relations.slice(1);
    },
    (m, c, step) => {
      if (step === 2) m.missing = true;
    },
    (m, c, step) => {
      if (step === 2) m.virtualtransaction = '4/30';
    },
  ];
  for (const [i, change] of mutations.entries())
    await t.test(`changed ${i}`, async () => {
      const f = fixture(change);
      await assert.rejects(
        inspectConnectedLease(f.client, expected, ready, catalogSha256),
        failure,
      );
    });
  const f = fixture();
  await assert.rejects(
    inspectConnectedLease(f.client, expected, ready, catalogSha256, {
      pid: 101,
      virtualtransaction: '4/29',
    }),
    failure,
  );
});

test('release requires closed target and retains stop marker until caller has awaited source completion', async () => {
  const calls = [];
  const client = {
    query: async (sql, parameters) => {
      calls.push([sql, parameters]);
      return { rows: [{ acquired: true, released: true }] };
    },
  };
  await assert.rejects(releaseConnectedLease(client, ready, stop), failure);
  assert.equal(calls.length, 0);
  const release = await releaseConnectedLease(client, ready, stop, {
    targetClosed: true,
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0][0], /pg_try_advisory_lock/);
  await release();
  assert.match(calls[1][0], /pg_advisory_unlock/);
  const broken = {
    query: async () => {
      throw Error('private server detail');
    },
  };
  await assert.rejects(
    releaseConnectedLease(broken, ready, stop, { targetClosed: true }),
    failure,
  );
});
