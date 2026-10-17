import type { z } from 'zod';
import { ApiError } from './api-error.js';

/** Validate untrusted request input without returning supplied values or Zod details. */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError('INVALID_REQUEST', 400);
  return parsed.data;
}
