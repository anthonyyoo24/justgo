import { sql } from 'drizzle-orm';
import { check, index, pgPolicy, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.ts';
import { appSchema, maintenance, time } from './shared.ts';

// An owner reaches its own rows. A guest row (no owner) is reachable only through
// the one original transaction ID the server verified with Apple and set for this transaction.
const ownerOrVerifiedGuest = sql`user_id = (select justgo.current_user_id()) OR (user_id is null AND original_transaction_id = (select current_setting('app.original_transaction_id',true)))`;

export const appStoreSubscriptions = appSchema
  .table(
    'app_store_subscriptions',
    {
      originalTransactionId: text('original_transaction_id').primaryKey(),
      userId: uuid('user_id').references(() => users.id),
      productId: text('product_id').notNull(),
      environment: text().notNull(),
      expiresAt: time('expires_at').notNull(),
      revokedAt: time('revoked_at'),
      latestTransactionId: text('latest_transaction_id').notNull(),
      appAccountToken: uuid('app_account_token'),
    },
    (t) => [
      index('app_store_subscriptions_owner_idx').on(t.userId),
      check(
        'app_store_subscriptions_transaction_ids',
        sql`${t.originalTransactionId} ~ '^[0-9]{1,32}$' and ${t.latestTransactionId} ~ '^[0-9]{1,32}$'`,
      ),
      check(
        'app_store_subscriptions_environment',
        sql`${t.environment} in ('Production', 'Sandbox')`,
      ),
      check(
        'app_store_subscriptions_product',
        sql`char_length(${t.productId}) between 1 and 255`,
      ),
      maintenance(),
      pgPolicy('owner_or_verified_guest', {
        to: 'justgo_runtime',
        using: ownerOrVerifiedGuest,
        withCheck: ownerOrVerifiedGuest,
      }),
    ],
  )
  .enableRLS();

export const billingEvents = appSchema
  .table(
    'billing_events',
    {
      eventId: text('event_id').primaryKey(),
      receivedAt: time('received_at').notNull().defaultNow(),
    },
    (t) => [
      check(
        'billing_events_event_id',
        sql`char_length(${t.eventId}) between 1 and 255`,
      ),
      maintenance(),
      pgPolicy('verified_event_access', {
        to: 'justgo_runtime',
        using: sql`event_id = (select current_setting('app.billing_event_id',true))`,
        withCheck: sql`event_id = (select current_setting('app.billing_event_id',true))`,
      }),
    ],
  )
  .enableRLS();
