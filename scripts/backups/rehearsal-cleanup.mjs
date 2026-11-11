import { rm } from 'node:fs/promises';

const cleanupFailure = 'Recovery rehearsal cleanup incomplete';

/** A manual restore uses the same database names, so only this comment marks a rehearsal's own. */
export const rehearsalMarker = 'justgo recovery rehearsal';

/**
 * Drop what a killed rehearsal left on the guarded loopback cluster. The session lock is held
 * until `admin` ends, and a killed run's lock ends with its session, so a free lock means any
 * marked database and the backup role are stale. Only the caller validates the admin target.
 */
export async function dropStaleRehearsal(admin) {
  const { rows } = await admin.query(
    "select pg_try_advisory_lock(hashtextextended('justgo recovery rehearsal', 0)) as acquired",
  );
  if (!rows[0].acquired)
    throw new Error('Another recovery rehearsal is running');
  const stale = await admin.query(
    `select d.datname from pg_database d
      join pg_shdescription s on s.objoid=d.oid and s.classoid='pg_database'::regclass
      where d.datname ~ '^justgo_restore_[0-9a-f]{12}$' and s.description=$1`,
    [rehearsalMarker],
  );
  for (const { datname } of stale.rows)
    await admin.query(`drop database ${datname} with(force)`);
  await admin.query('drop role if exists justgo_backup');
}

/** Release only owned resources; one failure must not retain later resources. */
export async function cleanupRehearsal(
  { pools, clients, ownedDatabases, ownsRole, admin, directory },
  rehearsalFailure,
  { remove = rm, report = console.error } = {},
) {
  const actions = [
    ...pools.map((pool) => () => pool.end()),
    ...clients.map((client) => () => client.end()),
    ...ownedDatabases
      .toReversed()
      .map((name) => () => admin.query(`drop database ${name} with(force)`)),
    ...(ownsRole ? [() => admin.query('drop role justgo_backup')] : []),
    ...(admin ? [() => admin.end()] : []),
    () => remove(directory, { recursive: true, force: true }),
  ];
  let incomplete = false;
  for (const action of actions) {
    try {
      await action();
    } catch {
      // Driver/filesystem errors can include connection details or key paths.
      incomplete = true;
    }
  }
  if (incomplete) {
    if (!rehearsalFailure) throw new Error(cleanupFailure);
    report(cleanupFailure);
  }
  if (rehearsalFailure) throw rehearsalFailure;
}
