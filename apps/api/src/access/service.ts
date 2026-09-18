import { accessResponseSchema, type AccessResponse } from '@justgo/contracts';
import type { IdentityService } from '../identity/service.js';

// Phase VIII supplies a database-backed billing projection here. Provider calls
// must happen outside the owner's short transaction. Tests inject isolated fixtures.
export type EntitlementReader = (
  tx: Parameters<Parameters<IdentityService['withSession']>[1]>[0],
) => Promise<AccessResponse>;
export class AccessService {
  constructor(
    private readonly identity: IdentityService,
    private readonly read: EntitlementReader = async () => ({
      status: 'unavailable',
      checkedAt: new Date().toISOString(),
    }),
  ) {}

  get(token: string) {
    return this.identity.withSession(token, async (tx) => {
      const access = accessResponseSchema.parse(await this.read(tx));
      if (
        access.status === 'verified' &&
        Date.parse(access.expiresAt) <= Date.now()
      )
        return {
          status: 'unpaid' as const,
          checkedAt: new Date().toISOString(),
        };
      return access;
    });
  }
}
