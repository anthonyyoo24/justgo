import { createHash, timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  billingRepairResponseSchema,
  type BillingRepairResponse,
} from '@justgo/contracts';
import type { ApiApp } from '../http/request.js';
import { ApiError } from '../http/api-error.js';
import type { IdentityService } from '../identity/service.js';
import { setTransactionContext } from '../db/transaction-context.js';
import type { AppleSubscriptionReader, VerifiedTransaction } from './apple.js';
import { applyConfirmed } from './webhook.js';

export type RepairLimits = {
  /** Rows read per scan. */
  batch: number;
  /**
   * Rows one run stores Apple's answer for at most. A row Apple refuses does
   * not count, so refused rows ahead in the order cannot starve later ones.
   */
  rows: number;
  /** Milliseconds after which a run stops starting new rows, refused or not. */
  budget: number;
};
const defaultLimits: RepairLimits = { batch: 25, rows: 100, budget: 20_000 };

/**
 * Re-read from Apple each subscription whose expiry passed since its last
 * check, and each subscription an unconfirmed event names. The checkpoint is
 * the rows themselves: a row leaves the due list in the same transaction that
 * stores Apple's answer, so a run that dies resumes with what is still due and
 * repeats no row it completed. Within a run a keyset cursor moves past rows
 * Apple refused, so one bad row cannot hold the batch.
 */
export class BillingRepair {
  constructor(
    private readonly identity: IdentityService,
    private readonly subscriptions: AppleSubscriptionReader,
    private readonly limits: RepairLimits = defaultLimits,
    private readonly now: () => number = Date.now,
  ) {}

  private async due(after: string): Promise<string[]> {
    const rows = await this.identity.db.transaction(async (tx) => {
      await setTransactionContext(tx, 'app.billing_repair', 'on');
      return (
        await tx.execute<{ original_transaction_id: string }>(
          sql`select original_transaction_id from (select original_transaction_id from justgo.app_store_subscriptions where expires_at <= now() and (checked_at is null or checked_at < expires_at) and original_transaction_id > ${after} union select original_transaction_id from justgo.billing_events where confirmed_at is null and original_transaction_id > ${after}) due order by original_transaction_id limit ${this.limits.batch}`,
        )
      ).rows;
    });
    return rows.map((row) => row.original_transaction_id);
  }

  async run(): Promise<BillingRepairResponse> {
    const started = this.now();
    let checked = 0;
    let failed = 0;
    let after = '';
    for (;;) {
      const ids = await this.due(after);
      if (ids.length === 0) return { checked, failed, remaining: false };
      for (const id of ids) {
        if (
          checked >= this.limits.rows ||
          this.now() - started >= this.limits.budget
        )
          return { checked, failed, remaining: true };
        after = id;
        let purchase: VerifiedTransaction;
        try {
          // Apple I/O runs between transactions, never inside one.
          purchase = await this.subscriptions(id);
        } catch (error) {
          // Apple refused this ID. Leave it due and move on.
          if (
            error instanceof ApiError &&
            (error.status === 400 || error.status === 404)
          ) {
            failed += 1;
            continue;
          }
          // Apple is unreachable. Stop, keep what committed, and answer 503.
          throw error;
        }
        await applyConfirmed(this.identity, purchase);
        checked += 1;
      }
    }
  }
}

const digest = (value: string) => createHash('sha256').update(value).digest();

export function billingRepairRoutes(
  app: ApiApp,
  identity: IdentityService,
  options: {
    subscriptions: AppleSubscriptionReader;
    repairSecret: string;
    limits?: RepairLimits;
  },
) {
  const repair = new BillingRepair(
    identity,
    options.subscriptions,
    options.limits,
  );
  const expected = digest(`Bearer ${options.repairSecret}`);
  app.post('/repair', async (context) => {
    await identity.rateLimit(
      context.get('clientAddress'),
      'billing-repair',
      60,
    );
    // Compare digests, so the check takes the same time for any length.
    if (
      !timingSafeEqual(
        digest(context.req.header('authorization') ?? ''),
        expected,
      )
    )
      throw new ApiError('UNAUTHORIZED');
    return context.json(billingRepairResponseSchema.parse(await repair.run()));
  });
}
