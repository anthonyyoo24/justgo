import { z } from 'zod';
export * from './identity.ts';
export * from './access.ts';
export * from './openapi.ts';

// Operational response contracts; identity contracts are exported above.
export const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
    service: z.literal('justgo-api'),
  })
  .strict();

export const readinessResponseSchema = z
  .object({
    status: z.enum(['ready', 'unavailable']),
  })
  .strict();

export type HealthResponse = z.infer<typeof healthResponseSchema>;
