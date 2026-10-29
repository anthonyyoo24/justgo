import { rm } from 'node:fs/promises';

const cleanupFailure = 'Recovery rehearsal cleanup incomplete';

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
