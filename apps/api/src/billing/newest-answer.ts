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
 */
export function newestAnswer(purchase: VerifiedTransaction) {
  const newer = sql`(expires_at < ${purchase.expiresAt} or (expires_at = ${purchase.expiresAt} and (signed_at is null or signed_at < ${purchase.signedAt})))`;
  return sql`product_id=case when ${newer} then ${purchase.productId} else product_id end, revoked_at=case when ${newer} then ${purchase.revokedAt} else revoked_at end, latest_transaction_id=case when ${newer} then ${purchase.transactionId} else latest_transaction_id end, signed_at=case when ${newer} then ${purchase.signedAt} else signed_at end, expires_at=greatest(expires_at,${purchase.expiresAt})`;
}
