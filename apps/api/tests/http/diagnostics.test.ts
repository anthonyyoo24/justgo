import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { loggerOptions, sqlState } from '../../src/http/diagnostics.js';

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
    const logger = pino(loggerOptions(), stream);
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
