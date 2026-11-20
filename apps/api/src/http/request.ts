import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { DiagnosticRequest } from './diagnostics.js';

export type ApiEnvironment = {
  Bindings: { incoming?: { socket: { remoteAddress?: string } } };
  Variables: {
    diagnostic: DiagnosticRequest;
    body: unknown;
    clientAddress: string;
  };
};
export type ApiApp = Hono<ApiEnvironment>;
export type ApiContext = Context<ApiEnvironment>;
export const requestBody = (context: ApiContext): unknown =>
  context.get('body');
export function requestQuery(
  context: ApiContext,
): Record<string, string | string[]> {
  return Object.fromEntries(
    Object.entries(context.req.queries()).map(([key, values]) => [
      key,
      values.length === 1 ? (values[0] ?? '') : values,
    ]),
  );
}
export function requestFailure(
  statusCode: number,
): Error & { statusCode: number } {
  return Object.assign(new Error('Invalid request'), { statusCode });
}

const contentType = (context: ApiContext) =>
  context.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();

/**
 * Bounded streaming read: do not trust Content-Length or buffer an unbounded
 * body. Answers undefined for a request with no body.
 */
export async function readRequestText(
  context: ApiContext,
  limit: number,
): Promise<
  { type: 'application/json' | 'text/plain'; text: string } | undefined
> {
  const body = context.req.raw.body;
  const type = contentType(context);
  if (!body && type === 'application/json') throw requestFailure(400);
  if (!body) return undefined;
  if (type !== 'application/json' && type !== 'text/plain')
    throw requestFailure(415);
  const length = context.req.header('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > limit)
    throw requestFailure(413);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const read = async () => {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > limit) throw requestFailure(413);
        chunks.push(value);
      }
    };
    await Promise.race([
      read(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(requestFailure(408)), 10000);
      }),
    ]);
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  if (length && /^\d+$/.test(length) && Number(length) !== bytes)
    throw requestFailure(400);
  const merged = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { type, text: new TextDecoder().decode(merged) };
}

/** Parse request JSON, keeping the prototype-pollution rejection. */
export function parseRequestJson(text: string): unknown {
  try {
    return JSON.parse(text, (key, value: unknown) => {
      // Preserve the prior parser's prototype-pollution rejection.
      if (
        key === '__proto__' ||
        (key === 'constructor' &&
          typeof value === 'object' &&
          value !== null &&
          Object.hasOwn(value, 'prototype'))
      )
        throw requestFailure(400);
      return value;
    }) as unknown;
  } catch {
    throw requestFailure(400);
  }
}

export function parseRequestBody(
  limit = 32 * 1024,
): MiddlewareHandler<ApiEnvironment> {
  return async (context, next) => {
    const read = await readRequestText(context, limit);
    context.set(
      'body',
      read === undefined
        ? undefined
        : read.type === 'text/plain'
          ? read.text
          : parseRequestJson(read.text),
    );
    await next();
  };
}
