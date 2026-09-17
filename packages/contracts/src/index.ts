import { z } from 'zod';

// Public operational responses only. Domain contracts arrive with their features.
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
