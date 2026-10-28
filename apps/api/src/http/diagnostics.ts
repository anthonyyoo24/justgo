import type { LoggerOptions } from 'pino';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  serverErrorDiagnostic,
  type ServerErrorReporter,
} from './server-error-reporter.js';

// Retain only validated public classification, never the exception or its contents.
const serverErrorSqlStates = new WeakMap<FastifyRequest, string>();
const reportedServerErrors = new WeakSet<FastifyRequest>();

/** Await before sending the response so a serverless instance retains the work. */
export async function reportServerErrorResponse(
  request: FastifyRequest,
  reply: FastifyReply,
  reporter?: ServerErrorReporter,
) {
  if (
    !reporter ||
    reply.statusCode < 500 ||
    reply.statusCode >= 600 ||
    reportedServerErrors.has(request)
  )
    return;
  reportedServerErrors.add(request);
  const code = serverErrorSqlStates.get(request);
  try {
    // This seam receives no Fastify request, reply, exception or request fields.
    const diagnostic = serverErrorDiagnostic({
      statusCode: reply.statusCode,
      requestId: request.id,
      ...(code ? { sqlState: code } : {}),
    });
    if (diagnostic) await reporter(Object.freeze(diagnostic));
  } catch {
    // Diagnostics failure cannot change the response or its existing log event.
  }
}

export function captureServerErrorSqlState(
  request: FastifyRequest,
  error: unknown,
) {
  const code = sqlState(error);
  serverErrorSqlStates.delete(request);
  if (code) serverErrorSqlStates.set(request, code);
}

/** One allowlisted event for every completed 5xx response, including direct replies. */
export async function logServerErrorResponse(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const code = serverErrorSqlStates.get(request);
  serverErrorSqlStates.delete(request);
  if (reply.statusCode >= 500 && reply.statusCode < 600)
    request.log.error(
      {
        statusCode: reply.statusCode,
        code: 'HTTP_SERVER_ERROR',
        ...(code ? { sqlState: code } : {}),
      },
      'HTTP server failure',
    );
}

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
      if (
        typeof code === 'string' &&
        code.length === 5 &&
        /^[0-9A-Z]{5}$/.test(code)
      )
        return code;
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
