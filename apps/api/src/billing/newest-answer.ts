import { sql } from 'drizzle-orm';
import type { VerifiedTransaction } from './apple.js';

/**
 * The SET list that keeps the newest Apple answer on a subscription row.
 *
 * Answers about one subscription can reach the database out of order, so
 * commit order says nothing about which is current. An answer is newer when
 * its period ends later, or when it covers the same period and Apple signed it
 * later. Apple signs every answer when it gives it, so an answer read before a
 * refund and saved after it is older than the refund and changes nothing,
 * while a strictly newer answer for the same period, such as a reversed
 * refund, still replaces it. The period comes first because Apple also signs
 * an old transaction afresh when asked about it, and that must never shorten
 * access or bring back an old state. An older answer leaves every field alone.
 *
 * Only Apple's subscription statuses carry renewal info. A newer answer with
 * none keeps the saved auto-renew for the same period and forgets it for a
 * later one, since a new period may follow a change the server has not seen.
 */
export function newestAnswer(purchase: VerifiedTransaction) {
  const newer = sql`(expires_at < ${purchase.expiresAt} or (expires_at = ${purchase.expiresAt} and (signed_at is null or signed_at < ${purchase.signedAt})))`;
  return sql`product_id=case when ${newer} then ${purchase.productId} else product_id end, revoked_at=case when ${newer} then ${purchase.revokedAt} else revoked_at end, latest_transaction_id=case when ${newer} then ${purchase.transactionId} else latest_transaction_id end, signed_at=case when ${newer} then ${purchase.signedAt} else signed_at end, trial=case when ${newer} then ${purchase.trial} else trial end, auto_renew=case when not ${newer} then auto_renew when ${purchase.autoRenew}::boolean is not null then ${purchase.autoRenew}::boolean when expires_at < ${purchase.expiresAt} then null else auto_renew end, expires_at=greatest(expires_at,${purchase.expiresAt})`;
}

/**
 * The saved trial and auto-renew state as the access answer carries it. An
 * unknown auto-renew stays out of the answer.
 */
export function renewalState(row: {
  trial: boolean;
  auto_renew: boolean | null;
}): { trial: boolean; autoRenew?: boolean } {
  return row.auto_renew === null
    ? { trial: row.trial }
    : { trial: row.trial, autoRenew: row.auto_renew };
}
