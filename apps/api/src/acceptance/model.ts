import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  accountAcceptanceResponseSchema,
  type AcceptanceVersions,
} from '@justgo/contracts';

type Tx = Parameters<Parameters<NodePgDatabase['transaction']>[0]>[0];

// Caller holds the authenticated account lock; bootstrap uses its newly allocated owner.
export async function writeAcceptance(
  tx: Tx,
  userId: string,
  versions: AcceptanceVersions,
) {
  await tx.execute(sql`insert into justgo.account_acceptances
    (user_id,terms_version,privacy_version,analytics_scope_version,accepted_at)
    values (${userId},${versions.termsVersion},${versions.privacyVersion},${versions.analyticsScopeVersion},clock_timestamp())
    on conflict (user_id) do update set
      terms_version=excluded.terms_version,
      privacy_version=excluded.privacy_version,
      analytics_scope_version=excluded.analytics_scope_version,
      accepted_at=excluded.accepted_at
    where (account_acceptances.terms_version,account_acceptances.privacy_version,account_acceptances.analytics_scope_version)
      is distinct from (excluded.terms_version,excluded.privacy_version,excluded.analytics_scope_version)`);
}

export async function readAcceptance(tx: Tx, userId: string) {
  const row = (
    await tx.execute<{
      id: string;
      analytics_restricted_at: Date | null;
      terms_version: string | null;
      privacy_version: string | null;
      analytics_scope_version: string | null;
      accepted_at: Date | null;
    }>(sql`select u.id,u.analytics_restricted_at,
      a.terms_version,a.privacy_version,a.analytics_scope_version,a.accepted_at
      from justgo.users u left join justgo.account_acceptances a on a.user_id=u.id
      where u.id=${userId} and u.deleted_at is null`)
  ).rows[0];
  if (!row) throw new Error('Account acceptance unavailable');
  return accountAcceptanceResponseSchema.parse({
    userId: row.id,
    analyticsRestricted: row.analytics_restricted_at !== null,
    receipt: row.accepted_at
      ? {
          userId: row.id,
          termsVersion: row.terms_version,
          privacyVersion: row.privacy_version,
          analyticsScopeVersion: row.analytics_scope_version,
          acceptedAt: new Date(row.accepted_at).toISOString(),
        }
      : null,
  });
}
