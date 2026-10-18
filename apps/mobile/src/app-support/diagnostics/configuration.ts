export type DiagnosticEnvironment = 'development' | 'staging' | 'production';
export type DiagnosticConfiguration = Readonly<{
  dsn: string;
  endpoint: string;
  environment: DiagnosticEnvironment;
}>;

/** Public ingestion key only. Private upload/authentication tokens never enter app config. */
export function diagnosticConfiguration(
  enabled: string | undefined,
  dsn: string | undefined,
  environment: string | undefined,
): DiagnosticConfiguration | null {
  if (
    enabled !== 'true' ||
    !dsn ||
    !['development', 'staging', 'production'].includes(environment ?? '')
  )
    return null;
  try {
    const url = new URL(dsn);
    if (
      url.protocol !== 'https:' ||
      !/^o\d+\.ingest\.us\.sentry\.io$/.test(url.hostname) ||
      !/^[a-f0-9]{32}$/.test(url.username) ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      url.pathname !== '/4512279181459456'
    )
      return null;
    return {
      dsn: url.href,
      endpoint: `${url.origin}/api/4512279181459456/envelope/`,
      environment: environment as DiagnosticEnvironment,
    };
  } catch {
    return null;
  }
}
