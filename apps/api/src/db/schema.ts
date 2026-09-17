import { sql } from 'drizzle-orm';
import {
  pgSchema,
  uuid,
  text,
  timestamp,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  foreignKey,
  check,
} from 'drizzle-orm/pg-core';

// Private schema. Tables, indexes and their RLS policies arrive with each feature.
export const appSchema = pgSchema('justgo');
const time = (name: string) => timestamp(name, { withTimezone: true });
export const users = appSchema.table('users', {
  id: uuid().primaryKey(),
  createdAt: time('created_at').notNull().defaultNow(),
  deletedAt: time('deleted_at'),
});
export const devices = appSchema.table(
  'devices',
  {
    id: uuid().notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: time('created_at').notNull().defaultNow(),
    revokedAt: time('revoked_at'),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);
export const credentials = appSchema.table(
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
  ],
);
export const sessions = appSchema.table(
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
  ],
);
export const transfers = appSchema.table(
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
    verification: text().notNull(),
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
  ],
);
export const rateBuckets = appSchema.table(
  'identity_rate_buckets',
  {
    key: text().primaryKey(),
    count: integer().notNull(),
    windowStart: time('window_start').notNull(),
  },
  (t) => [index('identity_rate_window_idx').on(t.windowStart)],
);
