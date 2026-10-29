import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiContext } from './request.js';
import type { IdentityErrorCode } from '@justgo/contracts';
import { ApiError } from './api-error.js';
import { captureServerErrorSqlState, sqlState } from './diagnostics.js';

/** Typed codes for request errors the HTTP reader raises before route code runs. */
const requestErrorCodes: Partial<Record<number, IdentityErrorCode>> = {
  400: 'INVALID_REQUEST',
  413: 'REQUEST_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
};

/**
 * Map a non-domain failure on a versioned route. Any other 4xx stays a client
 * error with its own status, so clients do not retry unchanged input as if the
 * service were down; only failures without a client status become 503.
 */
function versionedFailure(error: {
  statusCode?: number;
  code?: string;
  cause?: unknown;
}): { status: number; code: IdentityErrorCode } {
  if (sqlState(error) === '23505') return { status: 409, code: 'CONFLICT' };
  const status = error.statusCode;
  if (status !== undefined && status >= 400 && status < 500)
    return { status, code: requestErrorCodes[status] ?? 'INVALID_REQUEST' };
  return { status: 503, code: 'UNAVAILABLE' };
}

export function errorHandler(
  error: Error & { statusCode?: number },
  context: ApiContext,
) {
  const request = context.get('diagnostic');
  if (context.req.path.startsWith('/v1/')) {
    if (error instanceof ApiError) {
      if (
        error.code === 'RATE_LIMITED' &&
        error.retryAfterSeconds !== undefined
      )
        context.header('retry-after', String(error.retryAfterSeconds));
      return context.json(
        error.response(request.id),
        error.status as ContentfulStatusCode,
      );
    }
    const { status, code } = versionedFailure(error);
    if (status < 500) request.log.error({ err: error }, 'API operation failed');
    else captureServerErrorSqlState(request, error);
    return context.json(
      { code, requestId: request.id },
      status as ContentfulStatusCode,
    );
  }
  const status =
    error.statusCode && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : 500;
  if (status < 500) request.log.error({ err: error }, 'Request failed');
  else captureServerErrorSqlState(request, error);
  return context.json(
    {
      error: status < 500 ? 'Invalid request' : 'Internal server error',
      requestId: request.id,
    },
    status as ContentfulStatusCode,
  );
}

export function notFoundHandler(context: ApiContext) {
  const requestId = context.get('diagnostic').id;
  return context.json(
    context.req.path.startsWith('/v1/')
      ? { code: 'NOT_FOUND', requestId }
      : { error: 'Not found', requestId },
    404,
  );
}
