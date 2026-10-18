import { sql } from 'drizzle-orm';
import type { ExportPage } from '@justgo/contracts';
import type { IdentityService } from '../identity/service.js';
import { readAcceptance } from '../acceptance/model.js';
import {
  attemptQuery,
  projectAttempt,
  type AttemptRow,
} from '../attempts/model.js';

export class ExportService {
  constructor(private readonly identity: IdentityService) {}

  // Privacy controls intentionally require identity only, never an entitlement.
  page(token: string, cursor?: string): Promise<ExportPage> {
    return this.identity.withSession(token, async (tx, session) => {
      const userId = session.userId;
      const acceptance = await readAcceptance(tx, userId);
      const account = (
        await tx.execute<{ id: string; created_at: Date | string }>(
          sql`select id,created_at from justgo.users where id=${userId}`,
        )
      ).rows[0]!;
      const devices = (
        await tx.execute<{
          id: string;
          created_at: Date | string;
          revoked_at: Date | string | null;
        }>(
          sql`select id,created_at,revoked_at from justgo.devices where user_id=${userId} order by created_at,id`,
        )
      ).rows;
      // The existing (user_id,id) primary key supports every page depth.
      const rows = (
        await tx.execute<AttemptRow>(sql`${attemptQuery} where a.user_id=${userId}
          ${cursor ? sql`and a.id>${cursor}::uuid` : sql``}
          order by a.id limit 51`)
      ).rows;
      return {
        account: {
          id: account.id,
          createdAt: new Date(account.created_at).toISOString(),
          acceptance: acceptance.receipt,
          analyticsRestricted: acceptance.analyticsRestricted,
        },
        devices: devices.map((device) => ({
          id: device.id,
          createdAt: new Date(device.created_at).toISOString(),
          revokedAt: device.revoked_at
            ? new Date(device.revoked_at).toISOString()
            : null,
        })),
        attempts: rows.slice(0, 50).map(projectAttempt),
        nextCursor: rows.length > 50 ? rows[49]!.id : null,
      };
    });
  }
}
