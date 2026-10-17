import type { LoggerOptions } from 'pino';

/** PostgreSQL's public five-character code, including through driver wrappers. */
export function sqlState(error: unknown): string | undefined {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 8; depth++) {
    if (typeof current !== 'object' || current === null || seen.has(current))
      return;
    seen.add(current);
    try {
      const { code, cause } = current as { code?: unknown; cause?: unknown };
      if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
      current = cause;
    } catch {
      return;
    }
  }
}

// Allowlisted serializers: never serialize headers, URLs/query strings, payloads,
// user context, SQL, or provider error messages. Request IDs are generated locally.
export function loggerOptions(level = 'info'): LoggerOptions {
  return {
    level,
    redact: {
      paths: [
        'authorization',
        'cookie',
        'password',
        'token',
        'secret',
        'body',
        'headers',
        'reflection',
        'connectionString',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req: (req: { method?: string }) => ({ method: req.method }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
      err: (error: unknown) => {
        const code = sqlState(error);
        return {
          type: 'Error',
          message: 'Operation failed',
          ...(code ? { sqlState: code } : {}),
        };
      },
    },
  };
}
