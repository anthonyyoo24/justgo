import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Client } from 'pg';
import { withRecoveryFence } from './recovery-fence.mjs';

/** Actual lock/fault controls on the recovery rehearsal's run-owned local source. */
export async function rehearseRecoveryFence(connection) {
  if (
    !['127.0.0.1', 'localhost', '::1'].includes(connection.host) ||
    !/^justgo_restore_[a-f0-9]{12}$/.test(connection.database) ||
    connection.user !== 'postgres' ||
    connection.ssl !== false
  )
    throw new Error(
      'Fence fixture requires the owned loopback restore database',
    );
  const control = new Client(connection);
  const writer = new Client(connection);
  try {
    await control.connect();
    await writer.connect();
    await control.query(
      'create table auth.schema_migrations(version text primary key)',
    );
    await writer.query("set lock_timeout='100ms'");
    // This is only a synthetic fixture inspector, not the hosted catalog adapter.
    const inspect = async (client) => {
      const {
        rows: [identity],
      } = await client.query(
        'select current_database() as database, current_user as role',
      );
      const { rows: relations } =
        await client.query(`select n.nspname as schema,
        c.relname as name,c.oid::bigint::float8 as oid,c.relkind as kind,
        exists(select 1 from pg_inherits i where i.inhrelid=c.oid or i.inhparent=c.oid) as inherited
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname in('justgo','auth','drizzle','justgo_auth_private')
        and c.relkind in('r','p','f','m') order by n.nspname,c.relname`);
      const registry = await client.query(
        'select version from auth.schema_migrations order by version',
      );
      return {
        ...identity,
        source: 'synthetic.loopback/recovery-fence',
        relations,
        compatibilitySha256: createHash('sha256')
          .update(JSON.stringify(registry.rows))
          .digest('hex'),
      };
    };
    const expected = await inspect(control);
    const common = {
      connect: () => new Client(connection),
      inspect,
      expected,
      approvalReference: 'synthetic-owned-local-fence',
      noManualChangesWindowApproved: true,
      timeoutMs: 10000,
      pollMs: 50,
      closeTarget: async () => {},
    };
    let workRan = false;
    // Existing mutations reject the entire acquisition rather than waiting.
    await writer.query('begin');
    await writer.query('update auth.users set id=id');
    try {
      await assert.rejects(
        withRecoveryFence({
          ...common,
          work: async () => {
            workRan = true;
          },
        }),
      );
      assert.equal(workRan, false);
    } finally {
      await writer.query('rollback');
    }

    // A committed change between baseline inspection and lock acquisition must
    // be visible to the authoritative read after locks (no old RR snapshot).
    const subject = randomUUID();
    await control.query('insert into auth.users(id) values($1)', [subject]);
    let initialInspection = true;
    let fenceClient;
    const result = await withRecoveryFence({
      ...common,
      inspect: async (client) => {
        fenceClient = client;
        const value = await inspect(client);
        if (initialInspection) {
          initialInspection = false;
          await control.query('delete from auth.users where id=$1', [subject]);
        }
        return value;
      },
      work: async ({ assertCurrent }) => {
        await assertCurrent();
        assert.equal(
          (
            await fenceClient.query('select id from auth.users where id=$1', [
              subject,
            ])
          ).rowCount,
          0,
        );
        for (const table of [
          'auth.users',
          'auth.sessions',
          'auth.refresh_tokens',
          'justgo.users',
        ]) {
          await assert.rejects(
            writer.query(`delete from ${table} where false`),
            { code: '55P03' },
          );
        }
      },
      // Source locks remain effective until target shutdown is finished.
      closeTarget: async () => {
        await assert.rejects(
          writer.query('delete from auth.users where false'),
          { code: '55P03' },
        );
      },
    });
    assert.equal(result.writersMayOpen, false);
    await writer.query('delete from auth.users where false');

    // Registry writes are permitted by ACCESS SHARE; compatibility drift must
    // invalidate acceptance, rather than pretending the registry was frozen.
    await assert.rejects(
      withRecoveryFence({
        ...common,
        work: async ({ assertCurrent }) => {
          await control.query(
            "insert into auth.schema_migrations values('synthetic-upgrade')",
          );
          await assertCurrent();
        },
      }),
    );
    await control.query('delete from auth.schema_migrations');

    let fencePid,
      stoppedAfterLoss = false;
    await assert.rejects(
      withRecoveryFence({
        ...common,
        inspect: async (client) => {
          fencePid = (await client.query('select pg_backend_pid() as pid'))
            .rows[0].pid;
          return inspect(client);
        },
        work: async ({ signal }) => {
          await control.query('select pg_terminate_backend($1)', [fencePid]);
          await delay(5000, undefined, { signal }).catch(() => {});
        },
        closeTarget: async () => {
          stoppedAfterLoss = true;
        },
      }),
    );
    assert.equal(stoppedAfterLoss, true);
    await writer.query('delete from auth.users where false');
    return {
      dataWritesBlocked: true,
      readsSucceeded: true,
      postLockSnapshotFresh: true,
      registryDriftRejected: true,
      backendLossRejected: true,
      writersMayOpen: false,
    };
  } finally {
    await writer.query('rollback').catch(() => {});
    await writer.end();
    await control.end();
  }
}
