import { readFile } from 'node:fs/promises';
import { recoveryLockPlan } from './recovery-fence.mjs';

export const recoveryCatalogQuery = (
  await readFile(
    new URL('./recovery-source-catalog.sql', import.meta.url),
    'utf8',
  )
)
  .trim()
  .replace(/;$/, '');
const failure = () =>
  new Error('Connected recovery lease invalid; keep target closed');
const hash = /^[a-f0-9]{64}$/;
function pair(key) {
  if (
    !Array.isArray(key) ||
    key.length !== 2 ||
    key.some((n) => !Number.isInteger(n) || n < 1 || n > 2147483647)
  )
    throw failure();
  return key;
}
function pairs(keys) {
  if (
    !Array.isArray(keys) ||
    keys.length !== 2 ||
    JSON.stringify(keys[0]) === JSON.stringify(keys[1])
  )
    throw failure();
  keys.forEach(pair);
  return keys;
}

/** Build a single bounded statement for the already authenticated SQL connector.
 * The caller must separately authorize the source pause/no-manual-change window.
 * The ready marker is acquired only after every physical domain lock and a fresh
 * catalog check. The operator's separate reader can observe/release this lease
 * without a new source login, function, role, credential or privilege grant.
 */
export function connectedLeaseStatement(
  expected,
  { ready, stop, catalogSha256, timeoutMs = 45000 },
) {
  const plan = recoveryLockPlan(expected);
  pairs([ready, stop]);
  if (
    !hash.test(catalogSha256 ?? '') ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 500 ||
    timeoutMs > 45000
  )
    throw failure();
  const scope = plan.map(({ schema, name, oid, kind, inherited }) => ({
    schema,
    name,
    oid,
    kind,
    inherited,
  }));
  const signature = `select catalog_sha256,relations from (${recoveryCatalogQuery}) as signature`;
  const check = `select * into inspected from (${signature}) as current_signature;
    if inspected.catalog_sha256 is distinct from '${catalogSha256}' or inspected.relations is distinct from '${JSON.stringify(scope)}'::jsonb then
      raise exception 'Recovery source compatibility changed'; end if;`;
  return `do $justgo_connected_recovery$
declare inspected record; expires_at timestamptz;
begin
  if current_user <> 'postgres' or current_database() <> '${expected.database}'
    or current_setting('transaction_isolation') <> 'read committed'
    or current_setting('transaction_read_only') <> 'off' then
    raise exception 'Recovery operator identity or transaction mismatch'; end if;
  perform set_config('transaction_timeout','${timeoutMs + 5000}ms',true);
  perform set_config('lock_timeout','1000ms',true);
  perform set_config('search_path','pg_catalog',true);
  expires_at := clock_timestamp() + interval '${timeoutMs} milliseconds';
  ${check}
  ${plan.map((relation) => `${relation.sql};`).join('\n  ')}
  ${check}
  if not pg_try_advisory_xact_lock(${ready.join(',')}) then
    raise exception 'Recovery marker already held'; end if;
  loop
    if clock_timestamp() >= expires_at then raise exception 'Recovery lease expired'; end if;
    exit when exists(select 1 from pg_locks where locktype='advisory'
      and database=(select oid from pg_database where datname=current_database())
      and classid=${stop[0]}::oid and objid=${stop[1]}::oid and objsubid=2
      and mode='ExclusiveLock' and granted and pid<>pg_backend_pid());
    perform pg_sleep(0.05);
  end loop;
  ${check}
end $justgo_connected_recovery$;`;
}

/** Fresh autocommit reader only: a repeatable-read observer could miss DDL.
 * expectedIdentity pins this run's backend and virtual transaction after readiness.
 * Each caller must latch any failure, cancel target work and await its cleanup.
 */
export async function inspectConnectedLease(
  client,
  expected,
  ready,
  catalogSha256,
  expectedIdentity,
) {
  try {
    pair(ready);
    if (!hash.test(catalogSha256 ?? '')) throw failure();
    const plan = recoveryLockPlan(expected);
    const readMarker = () =>
      client.query(
        `select l.pid,l.virtualtransaction,
      current_database() as observer_database,current_setting('transaction_isolation') as observer_isolation,
      a.usename,clock_timestamp() as checked_at,
      coalesce((select jsonb_agg(jsonb_build_object('oid',held.relation::bigint,'mode',held.mode))
        from pg_locks held where held.pid=l.pid and held.virtualtransaction=l.virtualtransaction
          and held.locktype='relation' and held.granted),'[]'::jsonb) as locks
      from pg_locks l join pg_stat_activity a on a.pid=l.pid
      where l.locktype='advisory' and l.database=(select oid from pg_database where datname=current_database())
      and l.classid=$1::oid and l.objid=$2::oid and l.objsubid=2
      and l.mode='ExclusiveLock' and l.granted and l.pid<>pg_backend_pid()`,
        ready,
      );
    const validate = (rows, identity) => {
      const marker = rows[0];
      if (
        rows.length !== 1 ||
        marker.usename !== 'postgres' ||
        !Number.isInteger(marker.pid) ||
        marker.pid < 1 ||
        !/^\d+\/\d+$/.test(marker.virtualtransaction ?? '') ||
        marker.observer_database !== expected.database ||
        marker.observer_isolation !== 'read committed' ||
        !plan.every((r) =>
          marker.locks?.some((l) => l.oid === r.oid && l.mode === r.mode),
        ) ||
        (identity &&
          (marker.pid !== identity.pid ||
            marker.virtualtransaction !== identity.virtualtransaction))
      )
        throw failure();
      return marker;
    };
    const marker = validate((await readMarker()).rows, expectedIdentity);
    const catalog = (await client.query(recoveryCatalogQuery)).rows[0];
    if (
      catalog?.catalog_sha256 !== catalogSha256 ||
      JSON.stringify(
        recoveryLockPlan({ ...expected, relations: catalog.relations }),
      ) !== JSON.stringify(plan)
    )
      throw failure();
    const final = validate((await readMarker()).rows, marker);
    return {
      pid: final.pid,
      virtualtransaction: final.virtualtransaction,
      checkedAt: new Date(final.checked_at).toISOString(),
      writersMayOpen: false,
    };
  } catch {
    throw failure();
  }
}

/** Only signal completion after the caller has closed/awaited target services. */
export async function releaseConnectedLease(
  client,
  ready,
  stop,
  { targetClosed } = {},
) {
  try {
    pairs([ready, stop]);
    if (targetClosed !== true) throw failure();
    const {
      rows: [row],
    } = await client.query(
      'select pg_try_advisory_lock($1,$2) as acquired',
      stop,
    );
    if (row?.acquired !== true) throw failure();
    return async () => {
      try {
        const {
          rows: [released],
        } = await client.query(
          'select pg_advisory_unlock($1,$2) as released',
          stop,
        );
        if (released?.released !== true) throw failure();
      } catch {
        throw failure();
      }
    };
  } catch {
    throw failure();
  }
}
