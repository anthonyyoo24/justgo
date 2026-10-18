import { sql } from 'drizzle-orm';
import {
  currentAcceptanceVersionsSchema,
  isAnalyticsEligible,
  type AcceptanceVersions,
  type AnalyticsEventIdentity,
} from '@justgo/contracts';
import type { IdentityService } from '../identity/service.js';
import { readAcceptance, writeAcceptance } from './model.js';

export class AcceptanceService {
  constructor(private readonly identity: IdentityService) {}

  get(token: string) {
    return this.identity.withSession(token, (tx, session) =>
      readAcceptance(tx, session.userId),
    );
  }

  accept(token: string, versions: AcceptanceVersions) {
    const current = currentAcceptanceVersionsSchema.parse(versions);
    return this.identity.withSession(token, async (tx, session) => {
      await writeAcceptance(tx, session.userId, current);
      return readAcceptance(tx, session.userId);
    });
  }

  // A future privacy-request handler can suppress analytics without changing
  // product saving/access or erasing the legal receipt. Acceptance cannot lift it.
  restrictAnalytics(token: string) {
    return this.identity.withSession(token, async (tx, session) => {
      await tx.execute(sql`update justgo.users
        set analytics_restricted_at=coalesce(analytics_restricted_at,clock_timestamp())
        where id=${session.userId}`);
      return readAcceptance(tx, session.userId);
    });
  }

  /**
   * Future adapters await this immediately before each delivery, including delayed
   * work. Never cache this result or hold account locks during provider I/O.
   */
  async isEligibleForAnalytics(
    event: AnalyticsEventIdentity,
  ): Promise<boolean> {
    try {
      return await this.identity.db.transaction(async (tx) => {
        // The queue supplies its own owner; no request can choose another account.
        await tx.execute(
          sql`select set_config('app.user_id',${event.userId},true)`,
        );
        const owner = (
          await tx.execute<{ deleted_at: Date | null }>(
            sql`select deleted_at from justgo.users where id=${event.userId} for update`,
          )
        ).rows[0];
        if (!owner || owner.deleted_at) return false;
        const state = await readAcceptance(tx, event.userId);
        return isAnalyticsEligible({
          identityReady: true,
          acceptanceConfirmed: true,
          currentUserId: state.userId,
          receipt: state.receipt,
          analyticsRestricted: state.analyticsRestricted,
          event,
        });
      });
    } catch {
      // Missing confirmation and database failure both fail closed.
      return false;
    }
  }
}
