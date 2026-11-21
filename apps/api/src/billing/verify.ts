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
import { newestAnswer, renewalState } from './newest-answer.js';

type Tx = Parameters<Parameters<IdentityService['withSession']>[1]>[0];
type Subscription = {
  user_id: string;
  product_id: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
  trial: boolean;
  auto_renew: boolean | null;
};

/**
 * Whether an account is a guest, deleted or not. The guest mapping is visible
 * only while this transaction holds an Apple-verified original transaction ID,
 * and the share lock makes a concurrent link that ends the guest wait for this
 * transaction, or this read see the account it became.
 */
async function guestAccount(tx: Tx, userId: string) {
  return (
    (
      await tx.execute(
        sql`select 1 from justgo.managed_auth_accounts where user_id=${userId} and guest for share`,
      )
    ).rows.length > 0
  );
}

/**
 * Store a verified purchase under its original transaction ID for the caller
 * and answer whether it grants access now. Apple I/O has already finished, so
 * nothing here leaves the database.
 *
 * Every row has an owner. A row a guest account holds moves to the caller,
 * guest or signed in, so a guest's purchase follows the phone into the account
 * that signs in. A row a signed-in account holds stays there, and any other
 * caller gets 409. Apple's appAccountToken, when present, names the account
 * that bought it, so a token naming another signed-in account is refused too.
 */
async function save(
  tx: Tx,
  purchase: VerifiedTransaction,
  owner: string,
): Promise<AccessResponse> {
  await setTransactionContext(
    tx,
    'app.original_transaction_id',
    purchase.originalTransactionId,
  );
  // An unknown token fails closed: only the caller or a guest account passes.
  if (
    purchase.appAccountToken !== null &&
    purchase.appAccountToken !== owner &&
    !(await guestAccount(tx, purchase.appAccountToken))
  )
    throw new ApiError('CONFLICT', 409);
  await tx.execute(
    sql`insert into justgo.app_store_subscriptions (original_transaction_id,user_id,product_id,environment,expires_at,revoked_at,latest_transaction_id,app_account_token,signed_at,trial,auto_renew) values (${purchase.originalTransactionId},${owner},${purchase.productId},${purchase.environment},${purchase.expiresAt},${purchase.revokedAt},${purchase.transactionId},${purchase.appAccountToken},${purchase.signedAt},${purchase.trial},${purchase.autoRenew}) on conflict (original_transaction_id) do nothing`,
  );
  // The row is visible here only when the caller or a guest account holds it.
  const [stored] = (
    await tx.execute<Subscription>(
      sql`select user_id,product_id,expires_at,revoked_at,trial,auto_renew from justgo.app_store_subscriptions where original_transaction_id=${purchase.originalTransactionId} for update`,
    )
  ).rows;
  if (
    !stored ||
    (stored.user_id !== owner && !(await guestAccount(tx, stored.user_id)))
  )
    throw new ApiError('CONFLICT', 409);
  // The newest Apple answer wins, so one posted late never undoes a newer one.
  const [row] = (
    await tx.execute<Subscription>(
      sql`update justgo.app_store_subscriptions set user_id=${owner}, ${newestAnswer(purchase)} where original_transaction_id=${purchase.originalTransactionId} returning user_id,product_id,expires_at,revoked_at,trial,auto_renew`,
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
    source: 'subscription',
    productId: row.product_id,
    ...renewalState(row),
  };
}

export class BillingVerification {
  constructor(
    private readonly identity: IdentityService,
    private readonly apple: AppleTransactionReader,
  ) {}
  /** Apple is asked before any transaction opens. A guest verifies with its guest account's bearer. */
  async verify(token: string, transactionId: string) {
    const purchase = await this.apple(transactionId);
    return this.identity.withSession(
      token,
      (tx, session) => save(tx, purchase, session.userId),
      { guests: true },
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
      const token = bearer(context);
      return context.json(
        accessResponseSchema.parse(
          await verification.verify(token, transactionId),
        ),
      );
    },
  );
}
