export function localTestDatabaseUrl(value: string | undefined): URL {
  try {
    const url = new URL(value ?? '');
    if (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1'].includes(url.hostname) &&
      url.pathname === '/justgo_test' &&
      !url.search &&
      !url.hash
    )
      return url;
  } catch {
    /* Do not expose a malformed connection URL in diagnostics. */
  }
  // libpq/pg allow host, database and role overrides in query parameters.
  // Reject them rather than validate a different target than the driver uses.
  throw new Error(
    'Disposable test tooling requires a plain connection to dedicated loopback justgo_test',
  );
}
