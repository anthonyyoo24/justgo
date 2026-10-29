import { Writable } from 'node:stream';
import type {
  DiagnosticRequest,
  DiagnosticResponse,
} from '../../src/http/diagnostics.js';
import { describe, expect, it, vi } from 'vitest';
import {
  captureServerErrorSqlState,
  loggerOptions,
  createLogger,
  logServerErrorResponse,
  reportServerErrorResponse,
  sqlState,
} from '../../src/http/diagnostics.js';
import type { ServerErrorReporter } from '../../src/http/server-error-reporter.js';

describe('safe PostgreSQL diagnostics', () => {
  it.each(['23505', '08006', '40P01'])(
    'finds SQLSTATE %s through a query wrapper',
    (code) => {
      const error = new Error('private query', {
        cause: Object.assign(new Error('private detail'), { code }),
      });
      expect(sqlState(error)).toBe(code);
    },
  );
  it.each([
    null,
    '23505',
    { code: 'private' },
    { code: '23505 private' },
    { code: '23505\n' },
    { code: 'abcde' },
  ])('rejects non-SQLSTATE data', (error) => {
    expect(sqlState(error)).toBeUndefined();
  });
  it('bounds cyclic, deeply nested and throwing provider objects', () => {
    const cyclic: { cause?: unknown } = {};
    cyclic.cause = cyclic;
    expect(sqlState(cyclic)).toBeUndefined();
    let deep: unknown = { code: '23505' };
    for (let n = 0; n < 8; n++) deep = { cause: deep };
    expect(sqlState(deep)).toBeUndefined();
    expect(
      sqlState({
        get code() {
          throw new Error('private');
        },
      }),
    ).toBeUndefined();
  });
  it('logs the code without SQL, parameters, provider messages or nested private fields', () => {
    let output = '';
    const stream = new Writable({
      write(chunk, _encoding, next) {
        output += chunk.toString();
        next();
      },
    });
    const logger = createLogger({ ...loggerOptions(), stream });
    logger.error(
      {
        err: Object.assign(new Error('private query'), {
          query: 'private SQL',
          params: ['private credential'],
          cause: {
            code: '23505',
            detail: 'private reflection',
            table: 'private owner',
          },
        }),
      },
      'API operation failed',
    );
    expect(JSON.parse(output).err).toEqual({
      type: 'Error',
      message: 'Operation failed',
      sqlState: '23505',
    });
    expect(output).not.toContain('private');
  });
});

describe('server reporter seam', () => {
  it('prevents duplicate and reentrant reports while preserving completed-response logging', async () => {
    const error = vi.fn();
    const request = {
      id: 'a8bcb93b-c662-4119-80ac-3fc9775d5082',
      log: { error },
      body: { reflection: 'private' },
      headers: { authorization: 'private' },
    } as unknown as DiagnosticRequest;
    const reply = { statusCode: 503 } as DiagnosticResponse;
    captureServerErrorSqlState(
      request,
      new Error('private', { cause: { code: '08006', query: 'private' } }),
    );
    const reporter: ServerErrorReporter = vi.fn(async (diagnostic) => {
      expect(Object.isFrozen(diagnostic)).toBe(true);
      await reportServerErrorResponse(request, reply, reporter);
      throw new Error('private provider failure');
    });
    await Promise.all([
      reportServerErrorResponse(request, reply, reporter),
      reportServerErrorResponse(request, reply, reporter),
    ]);
    await reportServerErrorResponse(request, reply, reporter);
    expect(reporter).toHaveBeenCalledExactlyOnceWith({
      statusCode: 503,
      requestId: request.id,
      sqlState: '08006',
    });
    await logServerErrorResponse(request, reply);
    expect(error).toHaveBeenCalledExactlyOnceWith(
      {
        statusCode: 503,
        code: 'HTTP_SERVER_ERROR',
        sqlState: '08006',
      },
      'HTTP server failure',
    );
    expect(
      JSON.stringify((reporter as ReturnType<typeof vi.fn>).mock.calls),
    ).not.toContain('private');
  });

  it('never forwards an unvalidated request identifier or a success/client status', async () => {
    const reporter = vi.fn<ServerErrorReporter>().mockResolvedValue();
    for (const [id, statusCode] of [
      ['private', 503],
      ['a8bcb93b-c662-4119-80ac-3fc9775d5082', 200],
      ['a8bcb93b-c662-4119-80ac-3fc9775d5082', 499],
    ] as const) {
      const request = { id } as DiagnosticRequest;
      await reportServerErrorResponse(
        request,
        { statusCode } as DiagnosticResponse,
        reporter,
      );
    }
    expect(reporter).not.toHaveBeenCalled();
  });
});
