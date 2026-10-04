import { z } from 'zod';
export * from './identity.ts';
export * from './access.ts';
export * from './challenges.ts';
export * from './attempts.ts';
export * from './legacy-challenges.ts';
export * from './legacy-reflections.ts';
export * from './legacy-progress.ts';
export * from './reflections.ts';
export * from './progress.ts';
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
