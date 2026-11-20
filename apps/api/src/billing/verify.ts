import { sql } from 'drizzle-orm';
import {
  accessResponseSchema,
  billingVerificationRequestSchema,
  type AccessResponse,
} from '@justgo/contracts';
import type { ApiApp } from '../http/request.js';
import { parseRequestBody, requestBody } from '../http/request.js';
import { ApiError } from '../http/api-error.js';
import { bearer } from '../http/bearer.js';
import { parse } from '../http/parse.js';
import type { IdentityService } from '../identity/service.js';
import { setTransactionContext } from '../db/transaction-context.js';
import type { AppleTransactionReader, VerifiedTransaction } from './apple.js';
import { newestAnswer } from './newest-answer.js';

type Tx = Parameters<Parameters<IdentityService['withSession']>[1]>[0];
type Subscription = {
  user_id: string | null;
  product_id: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
};

/**
 * Store a verified purchase under its original transaction ID and answer
 * whether it grants access now. Apple I/O has already finished, so nothing
 * here leaves the database.
 *
 * A guest row (no owner) is reachable only through the verified original
 * transaction ID. An owner takes a guest row only when Apple's
 * appAccountToken names that owner. Otherwise the row stays a guest row and
 * the answer says so, leaving the move to adoption (P16-11). A row another
 * account owns is refused.
 */
async function save(
  tx: Tx,
  purchase: VerifiedTransaction,
  owner: string | null,
): Promise<AccessResponse> {
  // Apple's appAccountToken, when present, names the account that bought it.
  if (
    owner !== null &&
    purchase.appAccountToken !== null &&
    purchase.appAccountToken !== owner
  )
    throw new ApiError('CONFLICT', 409);
  await setTransactionContext(
    tx,
    'app.original_transaction_id',
    purchase.originalTransactionId,
  );
  await tx.execute(
    sql`insert into justgo.app_store_subscriptions (original_transaction_id,user_id,product_id,environment,expires_at,revoked_at,latest_transaction_id,app_account_token,signed_at) values (${purchase.originalTransactionId},${owner},${purchase.productId},${purchase.environment},${purchase.expiresAt},${purchase.revokedAt},${purchase.transactionId},${purchase.appAccountToken},${purchase.signedAt}) on conflict (original_transaction_id) do nothing`,
  );
  const [stored] = (
    await tx.execute<Subscription>(
      sql`select user_id,product_id,expires_at,revoked_at from justgo.app_store_subscriptions where original_transaction_id=${purchase.originalTransactionId} for update`,
    )
  ).rows;
  if (!stored || (stored.user_id !== null && stored.user_id !== owner))
    throw new ApiError('CONFLICT', 409);
  const holder =
    stored.user_id ??
    (owner !== null && purchase.appAccountToken === owner ? owner : null);
  // The newest Apple answer wins, so one posted late never undoes a newer one.
  const [row] = (
    await tx.execute<Subscription>(
      sql`update justgo.app_store_subscriptions set user_id=${holder}, ${newestAnswer(purchase)} where original_transaction_id=${purchase.originalTransactionId} returning user_id,product_id,expires_at,revoked_at`,
    )
  ).rows;
  if (!row) throw new ApiError('CONFLICT', 409);
  const checkedAt = new Date();
  const expiresAt = new Date(row.expires_at);
  if (row.revoked_at !== null || expiresAt <= checkedAt)
    return { status: 'unpaid', checkedAt: checkedAt.toISOString() };
  return {
    status: 'verified',
    checkedAt: checkedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    source: row.user_id === null ? 'guest_subscription' : 'subscription',
    productId: row.product_id,
  };
}

export class BillingVerification {
  constructor(
    private readonly identity: IdentityService,
    private readonly apple: AppleTransactionReader,
  ) {}
  /** Apple is asked before any transaction opens; a guest has no bearer. */
  async verify(token: string | undefined, transactionId: string) {
    const purchase = await this.apple(transactionId);
    if (token === undefined)
      return this.identity.db.transaction((tx) => save(tx, purchase, null));
    return this.identity.withSession(token, (tx, session) =>
      save(tx, purchase, session.userId),
    );
  }
}

export function billingRoutes(
  app: ApiApp,
  identity: IdentityService,
  apple: AppleTransactionReader,
) {
  const verification = new BillingVerification(identity, apple);
  app.post(
    '/verifications',
    async (context, next) => {
      await identity.rateLimit(context.get('clientAddress'), 'billing', 60);
      await next();
    },
    parseRequestBody(),
    async (context) => {
      const { transactionId } = parse(
        billingVerificationRequestSchema,
        requestBody(context),
      );
      const token =
        context.req.header('authorization') === undefined
          ? undefined
          : bearer(context);
      return context.json(
        accessResponseSchema.parse(
          await verification.verify(token, transactionId),
        ),
      );
    },
  );
}
