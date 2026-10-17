import type { LoggerOptions } from 'pino';

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
      err: () => ({ type: 'Error', message: 'Operation failed' }),
    },
  };
}
