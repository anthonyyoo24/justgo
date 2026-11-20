import { sql } from 'drizzle-orm';
import {
  uuid,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenance, ownerPolicies, time } from './shared.ts';

const identityPolicies = (setting: string) => [
  maintenance(),
  pgPolicy('identity_read', {
    for: 'select',
    to: 'justgo_runtime',
    using: sql.raw(
      `user_id = (select justgo.current_user_id()) OR digest = (select current_setting('${setting}',true))`,
    ),
  }),
  pgPolicy('owner_insert', {
    for: 'insert',
    to: 'justgo_runtime',
    withCheck: sql`user_id = (select justgo.current_user_id())`,
  }),
  pgPolicy('owner_update', {
    for: 'update',
    to: 'justgo_runtime',
    using: sql`user_id = (select justgo.current_user_id())`,
    withCheck: sql`user_id = (select justgo.current_user_id())`,
  }),
];
export const users = appSchema
  .table(
    'users',
    {
      id: uuid().primaryKey(),
      createdAt: time('created_at').notNull().defaultNow(),
      deletedAt: time('deleted_at'),
      deletionSessionDigest: text('deletion_session_digest'),
      analyticsRestrictedAt: time('analytics_restricted_at'),
      dataEpoch: integer('data_epoch').notNull().default(0),
      dataDeletedAt: time('data_deleted_at'),
    },
    (t) => [
      maintenance(),
      uniqueIndex('users_deletion_session_uq').on(t.deletionSessionDigest),
      pgPolicy('owner_read', {
        for: 'select',
        to: 'justgo_runtime',
        using: sql`id = (select justgo.current_user_id()) OR (deleted_at is not null AND deletion_session_digest = (select current_setting('app.session_digest',true)))`,
      }),
      pgPolicy('owner_insert', {
        for: 'insert',
        to: 'justgo_runtime',
        withCheck: sql`id = (select justgo.current_user_id())`,
      }),
      pgPolicy('owner_update', {
        for: 'update',
        to: 'justgo_runtime',
        using: sql`id = (select justgo.current_user_id())`,
        withCheck: sql`id = (select justgo.current_user_id())`,
      }),
    ],
  )
  .enableRLS();
export const devices = appSchema
  .table(
    'devices',
    {
      id: uuid().notNull(),
      userId: uuid('user_id')
        .notNull()
        .references(() => users.id),
      createdAt: time('created_at').notNull().defaultNow(),
      revokedAt: time('revoked_at'),
    },
    (t) => [primaryKey({ columns: [t.userId, t.id] }), ...ownerPolicies()],
  )
  .enableRLS();
export const credentials = appSchema
  .table(
    'recovery_credentials',
    {
      id: uuid().primaryKey(),
      userId: uuid('user_id')
        .notNull()
        .references(() => users.id),
      digest: text().notNull(),
      kind: text().notNull(),
      createdAt: time('created_at').notNull().defaultNow(),
      revokedAt: time('revoked_at'),
    },
    (t) => [
      uniqueIndex('credentials_digest_uq').on(t.digest),
      index('credentials_owner_idx').on(t.userId),
      check('credential_kind', sql`${t.kind} in ('sync', 'key')`),
      ...identityPolicies('app.credential_digest'),
    ],
  )
  .enableRLS();
export const sessions = appSchema
  .table(
    'device_sessions',
    {
      id: uuid().primaryKey(),
      userId: uuid('user_id')
        .notNull()
        .references(() => users.id),
      deviceId: uuid('device_id').notNull(),
      digest: text().notNull(),
      createdAt: time('created_at').notNull().defaultNow(),
      expiresAt: time('expires_at').notNull(),
      revokedAt: time('revoked_at'),
      rotatedTo: uuid('rotated_to'),
    },
    (t) => [
      uniqueIndex('sessions_digest_uq').on(t.digest),
      index('sessions_owner_device_idx').on(t.userId, t.deviceId),
      foreignKey({
        columns: [t.userId, t.deviceId],
        foreignColumns: [devices.userId, devices.id],
      }),
      ...identityPolicies('app.session_digest'),
      pgPolicy('owner_delete', {
        for: 'delete',
        to: 'justgo_runtime',
        using: sql`user_id = (select justgo.current_user_id())`,
      }),
    ],
  )
  .enableRLS();
export const transfers = appSchema
  .table(
    'device_transfers',
    {
      id: uuid().primaryKey(),
      codeDigest: text('code_digest').notNull(),
      claimDigest: text('claim_digest').notNull(),
      userId: uuid('user_id').references(() => users.id),
      deviceId: uuid('device_id').notNull(),
      sessionId: uuid('session_id').notNull(),
      sessionDigest: text('session_digest').notNull(),
      credentialDigest: text('credential_digest').notNull(),
      // Domain-separated HMAC verifier; never the six-digit approval code.
      verification: text().notNull(),
      verificationAttempts: integer('verification_attempts')
        .notNull()
        .default(0),
      createdAt: time('created_at').notNull().defaultNow(),
      expiresAt: time('expires_at').notNull(),
      approvedAt: time('approved_at'),
      redeemedAt: time('redeemed_at'),
      cancelledAt: time('cancelled_at'),
    },
    (t) => [
      uniqueIndex('transfers_code_uq').on(t.codeDigest),
      index('transfers_owner_idx').on(t.userId),
      index('transfers_expiry_idx').on(t.expiresAt),
      check(
        'transfers_verification_hmac',
        sql`${t.verification} ~ '^[a-f0-9]{64}$'`,
      ),
      check(
        'transfers_verification_attempts',
        sql`${t.verificationAttempts} between 0 and 5`,
      ),
      maintenance(),
      pgPolicy('owner_access', {
        to: 'justgo_runtime',
        using: sql`user_id = (select justgo.current_user_id()) OR code_digest = (select current_setting('app.transfer_digest',true))`,
        withCheck: sql`user_id = (select justgo.current_user_id()) OR code_digest = (select current_setting('app.transfer_digest',true))`,
      }),
      pgPolicy('owner_delete_only', {
        as: 'restrictive',
        for: 'delete',
        to: 'justgo_runtime',
        using: sql`user_id = (select justgo.current_user_id())`,
      }),
    ],
  )
  .enableRLS();
export const rateBuckets = appSchema
  .table(
    'identity_rate_buckets',
    {
      key: text().primaryKey(),
      count: integer().notNull(),
      windowStart: time('window_start').notNull(),
    },
    (t) => [
      index('identity_rate_window_idx').on(t.windowStart),
      maintenance(),
      pgPolicy('owner_access', {
        to: 'justgo_runtime',
        using: sql`key = (select current_setting('app.rate_key',true))`,
        withCheck: sql`key = (select current_setting('app.rate_key',true))`,
      }),
    ],
  )
  .enableRLS();

// Only a verified Auth subject can discover its canonical owner before owner context is set.
export const managedAuthAccounts = appSchema
  .table(
    'managed_auth_accounts',
    {
      authUserId: uuid('auth_user_id').primaryKey(),
      userId: uuid('user_id')
        .notNull()
        .references(() => users.id),
    },
    (t) => [
      uniqueIndex('managed_auth_owner_uq').on(t.userId),
      maintenance(),
      pgPolicy('verified_subject_access', {
        to: 'justgo_runtime',
        using: sql`auth_user_id = nullif(current_setting('app.auth_user_id',true),'')::uuid`,
        withCheck: sql`auth_user_id = nullif(current_setting('app.auth_user_id',true),'')::uuid and user_id = (select justgo.current_user_id())`,
      }),
    ],
  )
  .enableRLS();

export const managedAuthSessions = appSchema
  .table(
    'managed_auth_sessions',
    {
      id: uuid().primaryKey(),
      authUserId: uuid('auth_user_id')
        .notNull()
        .references(() => managedAuthAccounts.authUserId),
      userId: uuid('user_id')
        .notNull()
        .references(() => users.id),
      deviceId: uuid('device_id').notNull(),
      expiresAt: time('expires_at').notNull(),
      revokedAt: time('revoked_at'),
    },
    (t) => [
      index('managed_sessions_owner_idx').on(t.userId),
      ...ownerPolicies(),
    ],
  )
  .enableRLS();

export const managedAuthDeletions = appSchema
  .table(
    'managed_auth_deletions',
    {
      userId: uuid('user_id')
        .primaryKey()
        .references(() => users.id),
      authUserId: uuid('auth_user_id').notNull(),
      requestedAt: time('requested_at').notNull().defaultNow(),
      completedAt: time('completed_at'),
    },
    () => ownerPolicies(),
  )
  .enableRLS();
