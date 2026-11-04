import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { withRecoveryFence } from './recovery-fence.mjs';

const names = [
  'auth.refresh_tokens',
  'auth.schema_migrations',
  'auth.sessions',
  'auth.users',
  'drizzle.__drizzle_migrations',
  'justgo.users',
];
const expected = {
  source: 'reviewed-staging-source/postgres',
  database: 'postgres',
  role: 'postgres',
  compatibilitySha256: 'a'.repeat(64),
  relations: names.map((name, i) => ({
    schema: name.split('.')[0],
    name: name.split('.')[1],
    oid: i + 1,
    kind: 'r',
    inherited: false,
  })),
};
const failure = { message: 'Recovery fence failed; target must remain closed' };

function fixture() {
  const calls = [];
  let leaseId = '42';
  const locks = [];
  const client = Object.assign(new EventEmitter(), {
    connect: async () => {
      calls.push('connect');
    },
    query: async (sql) => {
      calls.push(sql);
      if (sql === 'commit') {
        leaseId = null;
        locks.length = 0;
      }
      if (sql.startsWith('lock table')) {
        const relation = expected.relations.find((r) =>
          sql.includes(`"${r.schema}"."${r.name}"`),
        );
        locks.push({
          oid: relation.oid,
          mode: sql.includes('access share') ? 'AccessShareLock' : 'ShareLock',
        });
      }
      return {
        rows: [
          {
            writes_fenced_at: new Date(),
            verified_through: new Date(),
            lease_id: leaseId,
            locks,
          },
        ],
      };
    },
    end: async () => {
      calls.push('end');
    },
  });
  let inspection = structuredClone(expected);
  return {
    calls,
    client,
    setInspection: (value) => {
      inspection = value;
    },
    options: {
      connect: () => client,
      expected,
      approvalReference: 'reviewed-window',
      noManualChangesWindowApproved: true,
      timeoutMs: 300,
      pollMs: 10,
      inspect: async () => {
        calls.push('inspect');
        return inspection;
      },
      work: async ({ writesFencedAt }) => {
        assert.ok(Date.parse(writesFencedAt));
        calls.push('work');
      },
      closeTarget: async () => {
        calls.push('close target');
      },
    },
  };
}

test('locks every reviewed data table, treats registry separately, and closes target before release', async () => {
  const f = fixture();
  const result = await withRecoveryFence(f.options);
  assert.equal(result.fenced, true);
  assert.equal(result.writersMayOpen, false);
  assert.ok(
    Date.parse(result.verifiedThrough) >= Date.parse(result.writesFencedAt),
  );
  assert.match(result.inspectionSha256, /^[a-f0-9]{64}$/);
  const locks = f.calls.filter((x) => x.startsWith('lock table'));
  assert.equal(locks.length, names.length);
  assert.ok(
    locks.includes(
      'lock table only "auth"."schema_migrations" in access share mode nowait',
    ),
  );
  assert.equal(
    locks.filter((x) => x.endsWith('in share mode nowait')).length,
    names.length - 1,
  );
  assert.ok(f.calls.indexOf('work') > f.calls.lastIndexOf(locks.at(-1)));
  assert.deepEqual(f.calls.slice(-3), [
    'select clock_timestamp() as verified_through',
    'rollback',
    'end',
  ]);
  assert.ok(f.calls.indexOf('close target') < f.calls.indexOf('rollback'));
});

test('an inspector that commits cannot release the lease and report success', async () => {
  const f = fixture();
  f.options.work = async ({ assertCurrent }) => {
    await f.client.query('commit');
    await assertCurrent();
  };
  await assert.rejects(withRecoveryFence(f.options), failure);
  assert.deepEqual(f.calls.slice(-3), ['close target', 'rollback', 'end']);
});

test('an observed drift stays fatal even if work catches it and metadata reverts', async () => {
  const f = fixture();
  f.options.work = async ({ assertCurrent }) => {
    f.setInspection({ ...expected, compatibilitySha256: 'b'.repeat(64) });
    await assert.rejects(assertCurrent(), failure);
    f.setInspection(structuredClone(expected));
  };
  await assert.rejects(withRecoveryFence(f.options), failure);
});

test('missing granted relation locks prevent work even with matching metadata and transaction', async () => {
  const f = fixture();
  const query = f.client.query;
  f.client.query = async (sql) => {
    const response = await query(sql);
    if (sql.includes('from pg_locks')) response.rows[0].locks = [];
    return response;
  };
  await assert.rejects(withRecoveryFence(f.options), failure);
  assert.ok(!f.calls.includes('work'));
});

test('cancellation during target shutdown awaits the same single shutdown task', async () => {
  const f = fixture();
  const controller = new AbortController();
  f.options.signal = controller.signal;
  let calls = 0;
  f.options.closeTarget = async () => {
    calls++;
    controller.abort();
    await delay(10);
    f.calls.push('target stopped');
  };
  await assert.rejects(withRecoveryFence(f.options), failure);
  assert.equal(calls, 1);
  assert.deepEqual(f.calls.slice(-3), ['target stopped', 'rollback', 'end']);
});

test('approval, identity, unsupported storage and injection failures never acquire a connection', async (t) => {
  const variants = [
    { noManualChangesWindowApproved: false },
    { approvalReference: '' },
    { timeoutMs: 60001 },
    { timeoutMs: 60000, pollMs: 5000 },
    { pollMs: 300 },
    { expected: { ...expected, role: 'supabase_admin' } },
    { expected: { ...expected, relations: expected.relations.slice(1) } },
    ...[
      { kind: 'f' },
      { inherited: true },
      { name: 'users";drop table users' },
      { oid: 0 },
    ].map((change) => ({
      expected: {
        ...expected,
        relations: expected.relations.map((r, i) =>
          i ? r : { ...r, ...change },
        ),
      },
    })),
    {
      expected: {
        ...expected,
        relations: [...expected.relations, expected.relations[0]],
      },
    },
  ];
  for (const [index, variant] of variants.entries())
    await t.test(`invalid case ${index}`, async () => {
      const f = fixture();
      await assert.rejects(withRecoveryFence({ ...f.options, ...variant }));
      assert.deepEqual(f.calls, []);
    });
});

test('a conflict during acquisition prevents work and rolls back all acquired locks', async () => {
  const f = fixture();
  const query = f.client.query;
  f.client.query = async (sql) => {
    if (sql.includes('"auth"."sessions"'))
      throw new Error('private SQL or credential');
    return query(sql);
  };
  await assert.rejects(withRecoveryFence(f.options), failure);
  assert.ok(!f.calls.includes('work'));
  assert.deepEqual(f.calls.slice(-3), ['close target', 'rollback', 'end']);
});

test('fresh post-lock inspection rejects a newly committed relation or changed OID', async (t) => {
  for (const change of ['inventory', 'oid', 'source', 'compatibility'])
    await t.test(change, async () => {
      const f = fixture();
      let reads = 0;
      f.options.inspect = async () => {
        if (++reads === 1) return expected;
        const changed = structuredClone(expected);
        if (change === 'inventory')
          changed.relations.push({
            ...changed.relations[0],
            name: 'new_table',
            oid: 100,
          });
        if (change === 'oid') changed.relations[0].oid = 100;
        if (change === 'source')
          changed.source = 'different-staging-source/postgres';
        if (change === 'compatibility')
          changed.compatibilitySha256 = 'b'.repeat(64);
        return changed;
      };
      await assert.rejects(withRecoveryFence(f.options), failure);
      assert.ok(!f.calls.includes('work'));
      assert.deepEqual(f.calls.slice(-3), ['close target', 'rollback', 'end']);
    });
});

test('connection loss, heartbeat drift, cancellation and deadline stop target before releasing locks', async (t) => {
  for (const cause of ['connection', 'drift', 'cancel', 'deadline'])
    await t.test(cause, async () => {
      const f = fixture();
      const controller = new AbortController();
      f.options.signal = controller.signal;
      f.options.timeoutMs = 100;
      f.options.work = async ({ signal }) => {
        f.calls.push('work');
        if (cause === 'connection')
          f.client.emit('error', new Error('private server text'));
        if (cause === 'drift')
          f.setInspection({ ...expected, compatibilitySha256: 'b'.repeat(64) });
        if (cause === 'cancel') controller.abort();
        await delay(1000, undefined, { signal }).catch(() => {});
        f.calls.push('work stopped');
      };
      await assert.rejects(withRecoveryFence(f.options), failure);
      assert.ok(f.calls.indexOf('work stopped') < f.calls.indexOf('rollback'));
      assert.ok(f.calls.indexOf('close target') < f.calls.indexOf('rollback'));
      assert.equal(f.calls.at(-1), 'end');
    });
});

test('late drift, failed target cleanup, rollback and disconnect invalidate provisional success', async (t) => {
  for (const stage of ['late drift', 'close target', 'rollback', 'end'])
    await t.test(stage, async () => {
      const f = fixture();
      if (stage === 'late drift')
        f.options.closeTarget = async () => {
          f.setInspection({ ...expected, compatibilitySha256: 'b'.repeat(64) });
        };
      if (stage === 'close target')
        f.options.closeTarget = async () => {
          throw new Error('private');
        };
      if (stage === 'rollback') {
        const query = f.client.query;
        f.client.query = (sql) =>
          sql === 'rollback'
            ? Promise.reject(new Error('private'))
            : query(sql);
      }
      if (stage === 'end')
        f.client.end = async () => {
          throw new Error('private');
        };
      await assert.rejects(withRecoveryFence(f.options), failure);
    });
});

test('already-cancelled work never connects and still closes the target', async () => {
  const f = fixture();
  await assert.rejects(
    withRecoveryFence({ ...f.options, signal: AbortSignal.abort() }),
    failure,
  );
  assert.deepEqual(f.calls, ['close target']);
});
