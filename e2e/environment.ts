export const journeyApiUrl = 'http://127.0.0.1:3000';
export const journeyAppUrl = 'http://127.0.0.1:8081';

/** Fixture writes must never reach a deployed or non-test database. */
export function journeyEnvironment(env: NodeJS.ProcessEnv) {
  if (env.VERCEL || env.NODE_ENV === 'production')
    throw new Error('Journey fixtures require a local test environment');
  const urls = ['DATABASE_URL', 'MIGRATION_DATABASE_URL'].map((name) => {
    let url: URL;
    try {
      url = new URL(env[name] ?? '');
    } catch {
      throw new Error('Journey fixtures require both database URLs');
    }
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      url.pathname !== '/justgo_test' ||
      url.search !== '' ||
      url.hash !== ''
    )
      throw new Error('Journey fixtures require loopback justgo_test');
    return url;
  });
  const [runtime, migration] = urls as [URL, URL];
  if (
    runtime.username !== 'justgo_runtime' ||
    migration.username !== 'justgo_migrator' ||
    (runtime.port || '5432') !== (migration.port || '5432') ||
    env.DATABASE_SSL !== 'disable'
  )
    throw new Error(
      'Journey fixtures require isolated roles on one local database',
    );
  return { runtimeUrl: runtime.href, migrationUrl: migration.href };
}
