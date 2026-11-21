import {
  accessResponseSchema,
  hasVerifiedAccess,
  type AccessResponse,
} from '@justgo/contracts';
import type { IdentityService } from '../identity/service.js';
import { ApiError } from '../http/api-error.js';

// Billing or explicitly configured staging grants supply verified access. Provider calls
// must happen outside the owner's short transaction. Tests inject isolated fixtures.
export type EntitlementReader = (
  tx: Parameters<Parameters<IdentityService['withSession']>[1]>[0],
) => Promise<AccessResponse>;
/** A lapsed or unpaid verification needs access, so only a missing or unavailable reader is a 503. */
export function requireVerifiedAccess(access: AccessResponse | undefined) {
  if (hasVerifiedAccess(access)) return;
  throw !access || access.status === 'unavailable'
    ? new ApiError('UNAVAILABLE', 503)
    : new ApiError('ACCESS_REQUIRED', 403);
}
/** A verified answer past its expiry reads as unpaid on every access route. */
export function currentAccess(access: AccessResponse): AccessResponse {
  if (access.status !== 'verified' || Date.parse(access.expiresAt) > Date.now())
    return access;
  return {
    status: 'unpaid',
    checkedAt: new Date().toISOString(),
    ...(access.source === 'free_beta' ? { source: access.source } : {}),
  };
}
export class AccessService {
  constructor(
    private readonly identity: IdentityService,
    private readonly read: EntitlementReader = async () => ({
      status: 'unavailable',
      checkedAt: new Date().toISOString(),
    }),
  ) {}

  get(token: string): Promise<AccessResponse> {
    return this.identity.withSession(
      token,
      async (tx) =>
        currentAccess(accessResponseSchema.parse(await this.read(tx))),
      { guests: true },
    );
  }
}
