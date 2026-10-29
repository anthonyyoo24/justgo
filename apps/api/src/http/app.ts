import { randomUUID } from 'node:crypto';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { ApiEnvironment, ApiContext } from './request.js';
import {
  createLogger,
  loggerOptions,
  logServerErrorResponse,
  reportServerErrorResponse,
} from './diagnostics.js';
import type { LoggerOptions } from './diagnostics.js';
import type { ServerErrorReporter } from './server-error-reporter.js';
import { errorHandler, notFoundHandler } from './error-handler.js';
import { requestFailure } from './request.js';
export type HttpOptions = {
  logger?: LoggerOptions | false;
  origins?: string[];
  reportServerError?: ServerErrorReporter;
  clientAddress?: (context: ApiContext) => string;
  releaseIdentity?: {
    sourceSha: string;
    environment: 'staging' | 'production';
  };
};
/** Shared request/response boundary for ordinary routes and Worker startup failures. */
export function createHttpApp(options: HttpOptions = {}) {
  const releaseIdentity = options.releaseIdentity;
  if (
    releaseIdentity &&
    (releaseIdentity.sourceSha.length !== 40 ||
      !/^[a-f0-9]{40}$/.test(releaseIdentity.sourceSha) ||
      !['staging', 'production'].includes(releaseIdentity.environment))
  )
    throw new Error('Invalid API release identity');
  const app = new Hono<ApiEnvironment>();
  app.use('*', async (context, next) => {
    await next();
    if (context.res.headers.get('content-type') === 'application/json')
      context.header('content-type', 'application/json; charset=utf-8');
    const policy = context.res.headers.get('content-security-policy');
    if (policy)
      context.header('content-security-policy', policy.replaceAll('; ', ';'));
  });
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        scriptSrcAttr: ["'none'"],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
        upgradeInsecureRequests: [],
      },
      strictTransportSecurity: 'max-age=31536000; includeSubDomains',
      referrerPolicy: 'no-referrer',
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use('*', async (context, next) => {
    const id = randomUUID();
    const diagnostic = {
      id,
      log: createLogger(options.logger ?? loggerOptions(), id),
    };
    context.set('diagnostic', diagnostic);
    diagnostic.log.info(
      { req: { method: context.req.method } },
      'incoming request',
    );
    context.set(
      'clientAddress',
      options.clientAddress?.(context) ??
        context.env?.incoming?.socket.remoteAddress ??
        '127.0.0.1',
    );
    context.header('x-request-id', id);
    context.header('cache-control', 'no-store');
    if (
      releaseIdentity &&
      context.req.method === 'GET' &&
      ['/health', '/ready'].includes(context.req.path)
    ) {
      context.header('x-justgo-source-sha', releaseIdentity.sourceSha);
      context.header('x-justgo-environment', releaseIdentity.environment);
    }
    await next();
    const response = { statusCode: context.res.status };
    await reportServerErrorResponse(
      diagnostic,
      response,
      options.reportServerError,
    );
    await logServerErrorResponse(diagnostic, response);
    diagnostic.log.info({ res: response }, 'request completed');
  });
  // Keep the existing CORS wire values, including spaces in Allow-Methods.
  app.use('*', async (context, next) => {
    // Hono tolerates undecodable paths; retain the previous router's 400 boundary.
    try {
      decodeURI(new URL(context.req.url).pathname);
    } catch {
      throw requestFailure(400);
    }
    const origin = context.req.header('origin');
    context.header('vary', 'Origin');
    if (options.origins?.includes('*'))
      context.header('access-control-allow-origin', '*');
    else if (origin && options.origins?.includes(origin))
      context.header('access-control-allow-origin', origin);
    context.header('access-control-expose-headers', 'retry-after');
    if (context.req.method === 'OPTIONS') {
      if (!origin || !context.req.header('access-control-request-method'))
        return context.text('Invalid Preflight Request', 400);
      context.header(
        'access-control-allow-methods',
        'GET, POST, PUT, PATCH, DELETE',
      );
      const headers = context.req.header('access-control-request-headers');
      if (headers) context.header('access-control-allow-headers', headers);
      context.header('vary', 'Origin, Access-Control-Request-Headers');
      context.header('content-length', '0');
      return context.body(null, 204);
    }
    await next();
  });
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  return app;
}
