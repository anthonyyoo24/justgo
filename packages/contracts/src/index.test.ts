import { describe, expect, it } from 'vitest';
import {
  healthResponseSchema,
  readinessResponseSchema,
  openApiDocument,
} from './index.js';

describe('public operational contracts', () => {
  it('accepts a health response without infrastructure details', () => {
    expect(
      healthResponseSchema.parse({ status: 'ok', service: 'justgo-api' })
        .status,
    ).toBe('ok');
    expect(
      healthResponseSchema.safeParse({
        status: 'ok',
        service: 'justgo-api',
        connectionString: 'secret',
      }).success,
    ).toBe(false);
  });
  it('does not confuse readiness with liveness', () => {
    expect(
      readinessResponseSchema.safeParse({ status: 'unavailable' }).success,
    ).toBe(true);
    expect(readinessResponseSchema.safeParse({ status: 'ok' }).success).toBe(
      false,
    );
  });
});

it('documents only canonical product resources after the final cutover', () => {
  const paths = Object.keys(openApiDocument.paths);
  expect(
    paths.filter((path) =>
      /challenges|attempts|progress|reflections/.test(path),
    ),
  ).toEqual([
    '/v1/challenges',
    '/v1/attempts',
    '/v1/attempts/{id}',
    '/v1/progress/summary',
    '/v1/progress/calendar',
  ]);
  expect(JSON.stringify(openApiDocument)).not.toContain('deprecated');
});
