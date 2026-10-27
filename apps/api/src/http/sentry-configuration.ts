export type ServerDiagnosticConfiguration = Readonly<{
  dsn: string;
  endpoint: string;
  environment: 'staging' | 'production';
  release: string;
}>;

/** Only a public US ingestion key and an exact reviewed commit are accepted. */
export function serverDiagnosticConfiguration(
  enabled: boolean,
  dsn: string | undefined,
  release: string | undefined,
  environment: 'staging' | 'production',
): ServerDiagnosticConfiguration | null {
  if (!enabled) return null;
  // Match the entire canonical DSN: no secret key, URL encoding, redirects,
  // alternate region, port, query, fragment or arbitrary ingestion destination.
  const parsed = dsn?.match(
    /^https:\/\/([a-f0-9]{32})@(o[1-9][0-9]{0,19}\.ingest\.us\.sentry\.io)\/([1-9][0-9]{0,19})$/,
  );
  if (
    !parsed ||
    parsed[0] !== dsn ||
    !release ||
    release.length !== 40 ||
    !/^[a-f0-9]{40}$/.test(release) ||
    !['staging', 'production'].includes(environment)
  )
    throw new Error('Invalid API Sentry configuration');
  return Object.freeze({
    dsn,
    endpoint: `https://${parsed[2]}/api/${parsed[3]}/envelope/`,
    environment,
    release: `justgo-api@${release}`,
  });
}
