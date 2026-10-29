import {
  serverErrorDiagnostic,
  type ServerErrorReporter,
} from './server-error-reporter.js';

// Retain only validated public classification, never the exception or its contents.
const serverErrorSqlStates = new WeakMap<DiagnosticRequest, string>();
const reportedServerErrors = new WeakSet<DiagnosticRequest>();

/** Await before sending the response so a serverless instance retains the work. */
export async function reportServerErrorResponse(
  request: DiagnosticRequest,
  reply: DiagnosticResponse,
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
    // This seam receives no HTTP request, reply, exception or request fields.
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
  request: DiagnosticRequest,
  error: unknown,
) {
  const code = sqlState(error);
  serverErrorSqlStates.delete(request);
  if (code) serverErrorSqlStates.set(request, code);
}

/** One allowlisted event for every completed 5xx response, including direct replies. */
export async function logServerErrorResponse(
  request: DiagnosticRequest,
  reply: DiagnosticResponse,
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

export type LoggerOptions = {
  level?: string;
  stream?: { write: (value: string) => unknown };
};
export type DiagnosticRequest = { id: string; log: SafeLogger };
export type DiagnosticResponse = { statusCode: number };
export type SafeLogger = {
  error: (fields: Record<string, unknown>, message: string) => void;
  info: (fields: Record<string, unknown>, message: string) => void;
};

export function loggerOptions(level = 'info'): LoggerOptions {
  return { level };
}

/** Reconstruct allowlisted fields rather than serializing request or error objects. */
export function createLogger(
  options: LoggerOptions | false = {},
  requestId?: string,
): SafeLogger {
  const write = (
    level: 30 | 50,
    fields: Record<string, unknown>,
    message: string,
  ) => {
    if (
      options === false ||
      options.level === 'silent' ||
      (level === 30 && ['error', 'warn'].includes(options.level ?? 'info'))
    )
      return;
    const output: Record<string, unknown> = { level, time: Date.now() };
    if (requestId && /^[a-f0-9-]{36}$/.test(requestId))
      output.reqId = requestId;
    if (
      typeof fields.statusCode === 'number' &&
      Number.isInteger(fields.statusCode) &&
      fields.statusCode >= 100 &&
      fields.statusCode < 600
    )
      output.statusCode = fields.statusCode;
    if (fields.code === 'HTTP_SERVER_ERROR') output.code = fields.code;
    const state = sqlState({ code: fields.sqlState });
    if (state) output.sqlState = state;
    if (fields.err)
      output.err = {
        type: 'Error',
        message: 'Operation failed',
        ...(sqlState(fields.err) ? { sqlState: sqlState(fields.err) } : {}),
      };
    if (fields.req && typeof fields.req === 'object') {
      const method = (fields.req as { method?: unknown }).method;
      if (
        typeof method === 'string' &&
        /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$/.test(method)
      )
        output.req = { method };
    }
    if (fields.res && typeof fields.res === 'object') {
      const statusCode = (fields.res as { statusCode?: unknown }).statusCode;
      if (
        typeof statusCode === 'number' &&
        Number.isInteger(statusCode) &&
        statusCode >= 100 &&
        statusCode < 600
      )
        output.res = { statusCode };
    }
    for (const key of [
      'authorization',
      'cookie',
      'password',
      'token',
      'secret',
      'body',
      'headers',
      'reflection',
      'connectionString',
    ])
      if (key in fields) output[key] = '[REDACTED]';
    output.msg = [
      'HTTP server failure',
      'API operation failed',
      'Request failed',
      'API startup failed',
      'incoming request',
      'request completed',
    ].includes(message)
      ? message
      : 'Operation failed';
    const line = JSON.stringify(output);
    if (options.stream) options.stream.write(line + '\n');
    else if (level === 50) console.error(line);
    else console.info(line);
  };
  return {
    error: (fields, message) => write(50, fields, message),
    info: (fields, message) => write(30, fields, message),
  };
}
