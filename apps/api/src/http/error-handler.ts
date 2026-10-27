import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import type { IdentityErrorCode } from '@justgo/contracts';
import { ApiError } from './api-error.js';
import { captureServerErrorSqlState, sqlState } from './diagnostics.js';

/** Typed codes for request errors Fastify raises before route code runs. */
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
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  if (request.url.startsWith('/v1/')) {
    if (error instanceof ApiError) {
      if (
        error.code === 'RATE_LIMITED' &&
        error.retryAfterSeconds !== undefined
      )
        reply.header('retry-after', error.retryAfterSeconds);
      void reply.code(error.status).send(error.response(request.id));
      return;
    }
    const { status, code } = versionedFailure(error);
    // The response hook owns 5xx reporting, including failures sent without a throw.
    if (status < 500) request.log.error({ err: error }, 'API operation failed');
    else captureServerErrorSqlState(request, error);
    void reply.code(status).send({ code, requestId: request.id });
    return;
  }
  const statusCode =
    error.statusCode && error.statusCode >= 400 && error.statusCode < 500
      ? error.statusCode
      : 500;
  if (statusCode < 500) request.log.error({ err: error }, 'Request failed');
  else captureServerErrorSqlState(request, error);
  void reply.code(statusCode).send({
    error: statusCode < 500 ? 'Invalid request' : 'Internal server error',
    requestId: request.id,
  });
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
  return reply
    .code(404)
    .send(
      request.url.startsWith('/v1/')
        ? { code: 'NOT_FOUND', requestId: request.id }
        : { error: 'Not found', requestId: request.id },
    );
}
