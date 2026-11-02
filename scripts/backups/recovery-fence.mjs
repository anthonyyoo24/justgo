import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';

const identifier = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/);
const inspectionSchema = z.strictObject({
  source: z.string().min(5).max(300),
  database: identifier,
  role: z.literal('postgres'),
  compatibilitySha256: z.string().regex(/^[a-f0-9]{64}$/),
  relations: z
    .array(
      z.strictObject({
        schema: z.enum(['justgo', 'auth', 'drizzle', 'justgo_auth_private']),
        name: identifier,
        oid: z.number().int().positive().max(4294967295),
        kind: z.literal('r'),
        inherited: z.literal(false),
      }),
    )
    .min(6)
    .max(500),
});
const failureMessage = 'Recovery fence failed; target must remain closed';

function reviewedInspection(value) {
  const checked = inspectionSchema.safeParse(value);
  if (!checked.success) throw new Error(failureMessage);
  const parsed = checked.data;
  const names = parsed.relations.map((r) => `${r.schema}.${r.name}`);
  if (
    new Set(names).size !== names.length ||
    new Set(parsed.relations.map((r) => r.oid)).size !== names.length ||
    ![
      'justgo.users',
      'auth.users',
      'auth.sessions',
      'auth.refresh_tokens',
      'auth.schema_migrations',
      'drizzle.__drizzle_migrations',
    ].every((name) => names.includes(name))
  )
    throw new Error(failureMessage);
  // Identifiers are bounded ASCII; match the SQL inventory's explicit C collation.
  parsed.relations.sort((a, b) => {
    const left = `${a.schema}.${a.name}`,
      right = `${b.schema}.${b.name}`;
    return left < right ? -1 : left > right ? 1 : 0;
  });
  return parsed;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** One reviewed scope shared by the direct-client and connected-operator leases. */
export function recoveryLockPlan(expected) {
  return reviewedInspection(expected).relations.map((relation) => ({
    ...relation,
    mode:
      relation.schema === 'auth' && relation.name === 'schema_migrations'
        ? 'AccessShareLock'
        : 'ShareLock',
    sql: `lock table only "${relation.schema}"."${relation.name}" in ${relation.schema === 'auth' && relation.name === 'schema_migrations' ? 'access share' : 'share'} mode nowait`,
  }));
}

/**
 * Own one fresh PostgreSQL connection and its bounded READ COMMITTED transaction.
 * The caller's inspection must bind the verified source and hash all relevant
 * catalog/ACL/helper and Auth version/public-key configuration, from fresh reads.
 * Inspection is metadata-only, must honor its AbortSignal and await every read,
 * and must never issue transaction control or writes.
 * It must enumerate the complete domain relation set, rejecting unsupported kinds.
 *
 * SHARE blocks domain writes. ACCESS SHARE on the provider migration registry
 * blocks replacement, not registry writes. A separately reviewed no-manual-DDL,
 * Auth/config/registry-change window is therefore required. Endpoint hashes do
 * not detect change-and-revert activity or fence provider upgrades physically.
 *
 * No restore, key use, grants or hosted maintenance is authorized by this helper.
 * work must use a separate source reader, honor signal and await all subprocesses.
 * closeTarget must stop/await target services and discard provisional acceptance;
 * it runs before this helper releases source locks, on success and failure alike.
 */
export async function withRecoveryFence({
  connect,
  inspect,
  expected,
  work,
  closeTarget,
  approvalReference,
  noManualChangesWindowApproved,
  signal,
  timeoutMs = 45000,
  pollMs = 1000,
}) {
  const reviewed = reviewedInspection(expected);
  if (
    typeof approvalReference !== 'string' ||
    approvalReference.length < 8 ||
    approvalReference.length > 200 ||
    noManualChangesWindowApproved !== true ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 100 ||
    timeoutMs > 60000 ||
    !Number.isInteger(pollMs) ||
    pollMs < 10 ||
    pollMs > 1000 ||
    pollMs >= timeoutMs ||
    ![connect, inspect, work, closeTarget].every(
      (fn) => typeof fn === 'function',
    )
  )
    throw new Error(failureMessage);

  const controller = new AbortController();
  const watcherControl = new AbortController();
  const stop = () => controller.abort(new Error(failureMessage));
  let rejectAbort;
  const aborted = new Promise((_, reject) => {
    rejectAbort = reject;
  });
  aborted.catch(() => {});
  controller.signal.addEventListener(
    'abort',
    () => rejectAbort(new Error(failureMessage)),
    { once: true },
  );
  const guarded = (promise) => Promise.race([promise, aborted]);
  const timer = setTimeout(stop, timeoutMs);
  signal?.addEventListener('abort', stop, { once: true });
  if (signal?.aborted) stop();
  let client,
    watcher,
    workTask,
    closeTask,
    leaseId,
    result,
    failed = false,
    targetClosed = false;
  let locksAcquired = false;
  const assertActive = () => {
    if (controller.signal.aborted) throw new Error(failureMessage);
  };
  const query = (...args) => guarded(client.query(...args));
  const stopTarget = () => {
    closeTask ??= Promise.resolve().then(closeTarget);
    return closeTask;
  };
  const assertLease = async () => {
    const {
      rows: [state],
    } = await query(`select
      pg_current_xact_id_if_assigned()::text as lease_id,
      coalesce((select jsonb_agg(jsonb_build_object('oid',relation::bigint,'mode',mode))
        from pg_locks where pid=pg_backend_pid() and locktype='relation' and granted),
        '[]'::jsonb) as locks`);
    if (state?.lease_id !== leaseId || !Array.isArray(state?.locks))
      throw new Error(failureMessage);
    if (
      locksAcquired &&
      !reviewed.relations.every((relation) =>
        state.locks.some(
          (lock) =>
            lock.oid === relation.oid &&
            lock.mode ===
              (relation.schema === 'auth' &&
              relation.name === 'schema_migrations'
                ? 'AccessShareLock'
                : 'ShareLock'),
        ),
      )
    )
      throw new Error(failureMessage);
  };
  const assertCurrent = async () => {
    try {
      assertActive();
      const current = await guarded(inspect(client, controller.signal));
      if (fingerprint(reviewedInspection(current)) !== fingerprint(reviewed))
        throw new Error(failureMessage);
      await assertLease();
      assertActive();
    } catch {
      stop();
      throw new Error(failureMessage);
    }
  };
  // Cleanup gets its own short bound after the lease deadline has fired.
  const cleanup = async (operation) => {
    let cleanupTimer;
    try {
      await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_, reject) => {
          cleanupTimer = setTimeout(
            () => reject(new Error(failureMessage)),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(cleanupTimer);
    }
  };
  try {
    assertActive();
    // This factory creates a new, disconnected, exclusively owned pg Client.
    client = connect();
    client.on('error', stop);
    client.on('end', stop);
    await guarded(client.connect());
    await query('begin isolation level read committed');
    await query(`set local statement_timeout='5000';
      set local lock_timeout='1000';
      set local idle_in_transaction_session_timeout='5000'`);
    // PostgreSQL 17 bounds the lease even if the operator process disappears.
    await query(`set local transaction_timeout='${timeoutMs}ms'`);
    leaseId = (await query('select pg_current_xact_id()::text as lease_id'))
      .rows[0]?.lease_id;
    if (!/^[0-9]+$/.test(leaseId ?? '')) throw new Error(failureMessage);
    await assertCurrent();
    for (const relation of recoveryLockPlan(reviewed)) {
      assertActive();
      await query(relation.sql);
    }
    locksAcquired = true;
    // READ COMMITTED deliberately starts this inspection after every lock.
    await assertCurrent();
    const {
      rows: [stamp],
    } = await query('select clock_timestamp() as writes_fenced_at');
    const writesFencedAt = z.iso
      .datetime()
      .parse(new Date(stamp.writes_fenced_at).toISOString());
    watcher = (async () => {
      while (!watcherControl.signal.aborted && !controller.signal.aborted) {
        await delay(pollMs, undefined, { signal: watcherControl.signal });
        if (!watcherControl.signal.aborted) await assertCurrent();
      }
    })().catch(() => {
      if (!watcherControl.signal.aborted) stop();
    });
    workTask = Promise.resolve().then(() =>
      work({
        signal: controller.signal,
        writesFencedAt,
        assertCurrent,
      }),
    );
    await guarded(workTask);
    await guarded(stopTarget());
    targetClosed = true;
    await assertCurrent();
    const {
      rows: [finalStamp],
    } = await query('select clock_timestamp() as verified_through');
    assertActive();
    result = {
      fenced: true,
      writersMayOpen: false,
      writesFencedAt,
      verifiedThrough: new Date(finalStamp.verified_through).toISOString(),
      inspectionSha256: fingerprint(reviewed),
      approvalReference,
    };
  } catch {
    failed = true;
  } finally {
    stop();
    watcherControl.abort();
    clearTimeout(timer);
    signal?.removeEventListener('abort', stop);
    // Stop target services before waiting for cancelled work or releasing locks.
    if (!targetClosed) {
      try {
        await cleanup(stopTarget);
      } catch {
        failed = true;
      }
    }
    if (workTask) {
      try {
        await cleanup(() => workTask);
      } catch {
        failed = true;
      }
    }
    if (watcher) await watcher;
    if (client) {
      try {
        await cleanup(() => client.query('rollback'));
      } catch {
        failed = true;
      }
      try {
        await cleanup(() => client.end());
      } catch {
        failed = true;
      }
    }
  }
  if (failed || !result) throw new Error(failureMessage);
  return result;
}
