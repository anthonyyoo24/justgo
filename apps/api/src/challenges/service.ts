import { sql } from 'drizzle-orm';
import type { ChallengeCard } from '@justgo/contracts';
import type { IdentityService } from '../identity/service.js';
import {
  requireVerifiedAccess,
  type EntitlementReader,
} from '../access/service.js';
export class ChallengeService {
  constructor(
    private readonly identity: IdentityService,
    private readonly entitlement?: EntitlementReader,
  ) {}
  /**
   * Return active Level 1 placements in stable venue/position order.
   * Reads require verified access; personal deck order remains client-owned.
   */
  catalog(token: string) {
    return this.identity.withSession(
      token,
      async (tx) => {
        requireVerifiedAccess(await this.entitlement?.(tx));
        return {
          cards: [
            ...(
              await tx.execute<ChallengeCard & Record<string, unknown>>(sql`
            select v.id,c.id as "challengeId",v.venue_id as venue,v.position,c.level_id as "levelId",c.text,c.subtext,c.duration_seconds as "durationSeconds"
            from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id
            where v.active and c.active and c.level_id='level-1' order by v.venue_id,v.position,v.id`)
            ).rows,
          ],
        };
      },
      // A guest that bought access reads the catalog like an account.
      { guests: true },
    );
  }
}
