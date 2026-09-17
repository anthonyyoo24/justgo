import { describe, expect, it } from 'vitest';
import { healthResponseSchema, readinessResponseSchema } from './index.js';

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
