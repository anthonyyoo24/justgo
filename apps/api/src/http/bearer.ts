import { z } from 'zod';
import { secretSchema } from '@justgo/contracts';
import type { ApiContext } from './request.js';
import { ApiError } from './api-error.js';

export function bearer(context: ApiContext) {
  const value = context.req.header('authorization');
  const parsed = z
    .union([
      secretSchema,
      z
        .string()
        .max(16000)
        .regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),
    ])
    .safeParse(value?.startsWith('Bearer ') ? value.slice(7) : undefined);
  if (!parsed.success) throw new ApiError('UNAUTHORIZED');
  return parsed.data;
}
