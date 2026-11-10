export function journeyServiceUrls(env: NodeJS.ProcessEnv) {
  const port = (key: string, fallback: number) => {
    const raw = env[key] ?? String(fallback);
    if (!/^\d+$/.test(raw) || Number(raw) < 1024 || Number(raw) > 65535)
      throw new Error(
        'Journey fixture ports must be integers from 1024 to 65535',
      );
    return Number(raw);
  };
  const apiPort = port('JUSTGO_JOURNEY_API_PORT', 3000);
  const appPort = port('JUSTGO_JOURNEY_APP_PORT', 8081);
  if (apiPort === appPort)
    throw new Error('Journey fixture ports must be distinct');
  // A prefix is a path only. The host and port above never come from it.
  const prefix = env.JUSTGO_JOURNEY_API_PREFIX ?? '';
  if (prefix && !/^(\/[A-Za-z0-9_-]+)+$/.test(prefix))
    throw new Error('Journey fixtures require a plain API path prefix');
  return {
    api: `http://127.0.0.1:${apiPort}${prefix}`,
    app: `http://127.0.0.1:${appPort}`,
  };
}
const serviceUrls = journeyServiceUrls(process.env);
/** The fixture API base: its loopback origin plus `JUSTGO_JOURNEY_API_PREFIX`. */
export const journeyApiUrl = serviceUrls.api;
export const journeyAppUrl = serviceUrls.app;

/** The path of a URL below the fixture API base, or null for any other URL. */
export function journeyApiPath(url: string, api = journeyApiUrl) {
  const target = new URL(url);
  const base = new URL(api);
  const prefix = base.pathname.replace(/\/$/, '');
  return target.origin === base.origin &&
    target.pathname.startsWith(`${prefix}/`)
    ? target.pathname.slice(prefix.length)
    : null;
}

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
