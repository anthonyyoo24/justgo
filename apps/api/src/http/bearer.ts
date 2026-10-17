import type { FastifyRequest } from 'fastify';
import { secretSchema } from '@justgo/contracts';
import { ApiError } from './api-error.js';

export function bearer(request: FastifyRequest) {
  const value = request.headers.authorization;
  const parsed = secretSchema.safeParse(
    value?.startsWith('Bearer ') ? value.slice(7) : undefined,
  );
  if (!parsed.success) throw new ApiError('UNAUTHORIZED');
  return parsed.data;
}
