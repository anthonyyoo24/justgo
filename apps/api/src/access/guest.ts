import { sql } from 'drizzle-orm';
import type { AccessResponse, ChallengeCard } from '@justgo/contracts';
import { hasVerifiedAccess } from '@justgo/contracts';
import type { IdentityService } from '../identity/service.js';
import { ApiError } from '../http/api-error.js';
export type GuestAccessReader = () => Promise<AccessResponse>;
export const unavailableGuestAccess: GuestAccessReader = async () => ({
  status: 'unpaid',
  checkedAt: new Date().toISOString(),
});
/** No identity or synthetic owner is created. Admission comes only from trusted server policy. */
export class GuestService {
  constructor(
    private readonly identity: IdentityService,
    private readonly read: GuestAccessReader = unavailableGuestAccess,
  ) {}
  access() {
    return this.read();
  }
  async catalog() {
    const access = await this.read();
    if (
      !hasVerifiedAccess(access) ||
      (access.status === 'verified' &&
        Date.parse(access.expiresAt) <= Date.now())
    )
      throw new ApiError(
        access.status === 'unavailable' ? 'UNAVAILABLE' : 'ACCESS_REQUIRED',
        access.status === 'unavailable' ? 503 : 403,
      );
    return this.identity.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.guest_catalog','on',true)`);
      return {
        cards: (
          await tx.execute<ChallengeCard & Record<string, unknown>>(
            sql`select v.id,c.id as "challengeId",v.venue_id as venue,v.position,c.level_id as "levelId",c.text,c.subtext,c.duration_seconds as "durationSeconds" from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id where v.active and c.active and c.level_id='level-1' order by v.venue_id,v.position,v.id`,
          )
        ).rows,
      };
    });
  }
}
