import { sql } from 'drizzle-orm';
import { check, index, pgPolicy, text, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.ts';
import { appSchema, maintenance, time } from './shared.ts';

// An owner reaches its own rows. A row a guest account holds is also reachable
// through the one original transaction ID the server verified with Apple and set
// for this transaction, so the verifying caller can take it over. Every row has
// an owner, and a write always leaves the row with the caller.
const owned = sql`user_id = (select justgo.current_user_id())`;
const ownerOrVerifiedGuest = sql`${owned} OR (original_transaction_id = (select current_setting('app.original_transaction_id',true)) AND EXISTS (select 1 from justgo.managed_auth_accounts m where m.user_id = app_store_subscriptions.user_id and m.guest))`;
// The webhook and the repair job hold no owner. They reach a subscription and its
// events only through the one original transaction ID Apple just confirmed, and
// they read and update but never insert.
const appleConfirmed = sql`original_transaction_id = (select current_setting('app.apple_confirmed_transaction_id',true))`;
// The repair job lists what is due before it can ask Apple: lapsed subscriptions
// it has not checked since they lapsed, and events whose confirmation failed.
const repairing = sql`(select current_setting('app.billing_repair',true)) = 'on'`;

export const appStoreSubscriptions = appSchema
  .table(
    'app_store_subscriptions',
    {
      originalTransactionId: text('original_transaction_id').primaryKey(),
      userId: uuid('user_id')
        .notNull()
        .references(() => users.id),
      productId: text('product_id').notNull(),
      environment: text().notNull(),
      expiresAt: time('expires_at').notNull(),
      revokedAt: time('revoked_at'),
      latestTransactionId: text('latest_transaction_id').notNull(),
      appAccountToken: uuid('app_account_token'),
      checkedAt: time('checked_at'),
      signedAt: time('signed_at'),
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
        withCheck: owned,
      }),
      pgPolicy('apple_confirmed_read', {
        for: 'select',
        to: 'justgo_runtime',
        using: appleConfirmed,
      }),
      pgPolicy('apple_confirmed_update', {
        for: 'update',
        to: 'justgo_runtime',
        using: appleConfirmed,
        withCheck: appleConfirmed,
      }),
      pgPolicy('billing_repair_scan', {
        for: 'select',
        to: 'justgo_runtime',
        using: sql`${repairing} AND expires_at <= now() AND (checked_at is null OR checked_at < expires_at)`,
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
      originalTransactionId: text('original_transaction_id'),
      confirmedAt: time('confirmed_at'),
    },
    (t) => [
      check(
        'billing_events_event_id',
        sql`char_length(${t.eventId}) between 1 and 255`,
      ),
      check(
        'billing_events_original_transaction_id',
        sql`${t.originalTransactionId} ~ '^[0-9]{1,32}$'`,
      ),
      index('billing_events_pending_idx')
        .on(t.originalTransactionId)
        .where(sql`${t.confirmedAt} is null`),
      maintenance(),
      pgPolicy('verified_event_access', {
        to: 'justgo_runtime',
        using: sql`event_id = (select current_setting('app.billing_event_id',true))`,
        withCheck: sql`event_id = (select current_setting('app.billing_event_id',true))`,
      }),
      pgPolicy('apple_confirmed_read', {
        for: 'select',
        to: 'justgo_runtime',
        using: appleConfirmed,
      }),
      pgPolicy('apple_confirmed_update', {
        for: 'update',
        to: 'justgo_runtime',
        using: appleConfirmed,
        withCheck: appleConfirmed,
      }),
      pgPolicy('billing_repair_scan', {
        for: 'select',
        to: 'justgo_runtime',
        using: sql`${repairing} AND confirmed_at is null AND original_transaction_id is not null`,
      }),
    ],
  )
  .enableRLS();
