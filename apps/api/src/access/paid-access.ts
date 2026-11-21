import { sql } from 'drizzle-orm';
import type { AccessResponse } from '@justgo/contracts';
import type { EntitlementReader } from './service.js';
import type { UploadEligibilityReader } from '../attempts/service.js';
import { unavailableGuestAccess, type GuestAccessReader } from './guest.js';

/**
 * Access from the subscriptions the API verified with Apple and saved. Each
 * row covers its owner until its expiry, or until Apple revoked it. Rows
 * belong to the owner, not to a data epoch, so delete-all keeps access.
 */
export function createPaidAccess(): {
  entitlementReader: EntitlementReader;
  uploadEligibilityReader: UploadEligibilityReader;
  guestAccessReader: GuestAccessReader;
} {
  return {
    // The account-free guest route reads no subscription, since every row has
    // an owner. A guest account reads its own rows through GET /v1/access.
    guestAccessReader: unavailableGuestAccess,
    entitlementReader: async (tx): Promise<AccessResponse> => {
      const checkedAt = new Date();
      const [row] = (
        await tx.execute<{ product_id: string; expires_at: Date | string }>(
          sql`select product_id,expires_at from justgo.app_store_subscriptions where user_id=justgo.current_user_id() and revoked_at is null and expires_at>${checkedAt} order by expires_at desc limit 1`,
        )
      ).rows;
      if (!row) return { status: 'unpaid', checkedAt: checkedAt.toISOString() };
      return {
        status: 'verified',
        source: 'subscription',
        productId: row.product_id,
        checkedAt: checkedAt.toISOString(),
        expiresAt: new Date(row.expires_at).toISOString(),
      };
    },
    // Rule 9: a completion started inside a covered period uploads after that
    // period ends. The owner filter repeats the session owner as defense in depth.
    uploadEligibilityReader: async (tx, context) => {
      if (Date.parse(context.startedAt) > Date.now()) return 'ineligible';
      const covered = (
        await tx.execute<{ covered: boolean }>(
          sql`select exists(select 1 from justgo.app_store_subscriptions where user_id=justgo.current_user_id() and user_id=${context.userId}::uuid and ${context.startedAt}::timestamptz<least(expires_at,revoked_at)) as covered`,
        )
      ).rows[0]?.covered;
      return covered ? 'eligible' : 'ineligible';
    },
  };
}
