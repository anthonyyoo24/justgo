import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { secretSchema } from '@justgo/contracts';
import { ApiError } from './api-error.js';

export function bearer(request: FastifyRequest) {
  const value = request.headers.authorization;
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
