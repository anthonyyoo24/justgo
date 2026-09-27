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
    // Domain-separated HMAC verifier; never the six-digit approval code.
    verification: text().notNull(),
    verificationAttempts: integer('verification_attempts').notNull().default(0),
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

// Phase 04 content is immutable; venue placements and owner queues are independent.
export const levels = appSchema.table('levels', {
  id: text().primaryKey(),
  name: text().notNull(),
});
export const venues = appSchema.table('venues', {
  id: text().primaryKey(),
  name: text().notNull(),
});
export const challenges = appSchema.table('challenges', {
  id: text().primaryKey(),
});
export const challengeRevisions = appSchema.table(
  'challenge_revisions',
  {
    id: text().primaryKey(),
    challengeId: text('challenge_id')
      .notNull()
      .references(() => challenges.id),
    levelId: text('level_id')
      .notNull()
      .references(() => levels.id),
    text: text().notNull(),
    subtext: text(),
    durationSeconds: integer('duration_seconds').notNull(),
  },
  (t) => [check('positive_duration', sql`${t.durationSeconds} > 0`)],
);
export const venueCards = appSchema.table(
  'venue_cards',
  {
    id: text().primaryKey(),
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id),
    revisionId: text('revision_id')
      .notNull()
      .references(() => challengeRevisions.id),
    position: integer().notNull(),
  },
  (t) => [uniqueIndex('venue_card_position').on(t.venueId, t.position)],
);
export const challengePreferences = appSchema.table('challenge_preferences', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  venueId: text('venue_id')
    .notNull()
    .references(() => venues.id),
});
export const venueQueues = appSchema.table(
  'venue_queues',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id),
    version: integer().notNull().default(0),
    cardIds: text('card_ids').array().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.venueId] }),
    check('queue_version_positive', sql`${t.version} >= 0`),
  ],
);
export const deckSkips = appSchema.table(
  'deck_skips',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    id: uuid().notNull(),
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id),
    cardId: text('card_id')
      .notNull()
      .references(() => venueCards.id),
    revisionId: text('revision_id')
      .notNull()
      .references(() => challengeRevisions.id),
    queueVersion: integer('queue_version').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] })],
);
export const attempts = appSchema.table(
  'attempts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    id: uuid().notNull(),
    cardId: text('card_id')
      .notNull()
      .references(() => venueCards.id),
    venueId: text('venue_id')
      .notNull()
      .references(() => venues.id),
    challengeId: text('challenge_id')
      .notNull()
      .references(() => challenges.id),
    revisionId: text('revision_id')
      .notNull()
      .references(() => challengeRevisions.id),
    levelId: text('level_id')
      .notNull()
      .references(() => levels.id),
    queueVersion: integer('queue_version').notNull(),
    status: text().notNull().default('active'),
    startedAt: time('started_at').notNull(),
    deadlineAt: time('deadline_at').notNull(),
    endedAt: time('ended_at'),
    completionDate: text('completion_date'),
    timeZone: text('time_zone'),
    elapsedSeconds: integer('elapsed_seconds'),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.id] }),
    uniqueIndex('one_active_attempt')
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
    index('attempt_owner_end_idx').on(t.userId, t.endedAt),
    check(
      'attempt_status',
      sql`${t.status} in ('active','completed','given_up')`,
    ),
    check(
      'attempt_outcome_fields',
      sql`(${t.status} = 'active' and ${t.endedAt} is null and ${t.timeZone} is null and ${t.elapsedSeconds} is null and ${t.completionDate} is null) or (${t.status} <> 'active' and ${t.endedAt} is not null and ${t.elapsedSeconds} is not null and ${t.endedAt} >= ${t.startedAt} and ${t.timeZone} is not null and ${t.elapsedSeconds} >= 0 and ((${t.status} = 'completed' and ${t.completionDate} is not null) or (${t.status} = 'given_up' and ${t.completionDate} is null)))`,
    ),
    check('attempt_deadline', sql`${t.deadlineAt} > ${t.startedAt}`),
  ],
);
