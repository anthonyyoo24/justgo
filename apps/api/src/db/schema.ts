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
  jsonb,
  pgPolicy,
  boolean,
} from 'drizzle-orm/pg-core';

// Private schema. Tables, indexes and their RLS policies arrive with each feature.
export const appSchema = pgSchema('justgo');
const time = (name: string) => timestamp(name, { withTimezone: true });
const maintenance = () =>
  pgPolicy('migration_maintenance', {
    to: 'justgo_migrator',
    using: sql`true`,
    withCheck: sql`true`,
  });
const ownerPolicies = (column = 'user_id') => [
  maintenance(),
  pgPolicy('owner_access', {
    to: 'justgo_runtime',
    using: sql.raw(`${column} = (select justgo.current_user_id())`),
    withCheck: sql.raw(`${column} = (select justgo.current_user_id())`),
  }),
];
const catalogPolicies = () => [
  maintenance(),
  pgPolicy('catalog_read', {
    for: 'select',
    to: 'justgo_runtime',
    using: sql`(select justgo.current_user_id()) is not null`,
  }),
];
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
    },
    () => ownerPolicies('id'),
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

// Phase 07.1 retains legacy revision/queue columns until the coordinated cutover.
export const levels = appSchema
  .table(
    'levels',
    {
      id: text().primaryKey(),
      name: text().notNull(),
    },
    catalogPolicies,
  )
  .enableRLS();
export const venues = appSchema
  .table(
    'venues',
    {
      id: text().primaryKey(),
      name: text().notNull(),
    },
    catalogPolicies,
  )
  .enableRLS();
export const challenges = appSchema
  .table(
    'challenges',
    {
      id: text().primaryKey(),
      levelId: text('level_id')
        .notNull()
        .references(() => levels.id),
      text: text().notNull(),
      subtext: text(),
      durationSeconds: integer('duration_seconds').notNull(),
      active: boolean().notNull().default(true),
    },
    (t) => [
      ...catalogPolicies(),
      check('challenge_positive_duration', sql`${t.durationSeconds} > 0`),
      index('challenges_level_idx').on(t.levelId),
    ],
  )
  .enableRLS();
export const challengeRevisions = appSchema
  .table(
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
    (t) => [
      check('positive_duration', sql`${t.durationSeconds} > 0`),
      ...catalogPolicies(),
    ],
  )
  .enableRLS();
export const venueCards = appSchema
  .table(
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
      challengeId: text('challenge_id')
        .notNull()
        .references(() => challenges.id),
      active: boolean().notNull().default(true),
    },
    (t) => [
      uniqueIndex('venue_card_position').on(t.venueId, t.position),
      index('venue_cards_challenge_idx').on(t.challengeId),
      ...catalogPolicies(),
    ],
  )
  .enableRLS();
export const challengePreferences = appSchema
  .table(
    'challenge_preferences',
    {
      userId: uuid('user_id')
        .primaryKey()
        .references(() => users.id),
      venueId: text('venue_id')
        .notNull()
        .references(() => venues.id),
    },
    () => ownerPolicies(),
  )
  .enableRLS();
export const venueQueues = appSchema
  .table(
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
      ...ownerPolicies(),
    ],
  )
  .enableRLS();
export const deckSkips = appSchema
  .table(
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
    (t) => [primaryKey({ columns: [t.userId, t.id] }), ...ownerPolicies()],
  )
  .enableRLS();
export const attempts = appSchema
  .table(
    'attempts',
    {
      userId: uuid('user_id')
        .notNull()
        .references(() => users.id),
      id: uuid().notNull(),
      cardId: text('card_id').references(() => venueCards.id),
      venueId: text('venue_id')
        .notNull()
        .references(() => venues.id),
      challengeId: text('challenge_id')
        .notNull()
        .references(() => challenges.id),
      revisionId: text('revision_id').references(() => challengeRevisions.id),
      levelId: text('level_id')
        .notNull()
        .references(() => levels.id),
      queueVersion: integer('queue_version'),
      status: text().notNull().default('active'),
      startedAt: time('started_at').notNull(),
      deadlineAt: time('deadline_at'),
      endedAt: time('ended_at'),
      completionDate: text('completion_date'),
      timeZone: text('time_zone'),
      activityDate: text('activity_date'),
      startTimeZone: text('start_time_zone'),
      legacyDisplayTimeZone: text('legacy_display_time_zone'),
      reflectionFeeling: text('reflection_feeling'),
      reflectionText: text('reflection_text'),
      reflectionRevision: integer('reflection_revision').notNull().default(0),
    },
    (t) => [
      primaryKey({ columns: [t.userId, t.id] }),
      uniqueIndex('one_active_attempt')
        .on(t.userId)
        .where(sql`${t.status} = 'active'`),
      index('attempt_owner_end_idx').on(t.userId, t.endedAt),
      index('attempt_history_day_idx')
        .on(t.userId, t.completionDate, t.endedAt, t.id)
        .where(sql`${t.status} = 'completed'`),
      index('attempt_canonical_history_idx')
        .on(
          t.userId,
          sql`coalesce(${t.activityDate}, ${t.completionDate})`,
          t.startedAt,
          t.id,
        )
        .where(sql`${t.status} = 'completed'`),
      index('attempt_challenge_idx').on(t.challengeId),
      check(
        'attempt_status',
        sql`${t.status} in ('active','completed','given_up')`,
      ),
      check(
        'attempt_outcome_fields',
        sql`(${t.startTimeZone} is null and ${t.cardId} is not null and ${t.revisionId} is not null and ${t.queueVersion} is not null and ${t.deadlineAt} is not null and ((${t.status} = 'active' and ${t.endedAt} is null and ${t.timeZone} is null and ${t.completionDate} is null) or (${t.status} <> 'active' and ${t.endedAt} is not null and ${t.endedAt} >= ${t.startedAt} and ${t.timeZone} is not null and ((${t.status} = 'completed' and ${t.completionDate} is not null) or (${t.status} = 'given_up' and ${t.completionDate} is null))))) or (${t.startTimeZone} is not null and ${t.status} = 'completed' and ${t.activityDate} is not null and ${t.cardId} is null and ${t.revisionId} is null and ${t.queueVersion} is null and ${t.deadlineAt} is null and ${t.endedAt} is null and ${t.completionDate} is null and ${t.timeZone} is null and ${t.legacyDisplayTimeZone} is null)`,
      ),
      check('attempt_deadline', sql`${t.deadlineAt} > ${t.startedAt}`),
      check(
        'attempt_activity_date',
        sql`${t.activityDate} is null or (${t.status} = 'completed' and ${t.activityDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')`,
      ),
      check(
        'attempt_reflection_content',
        sql`(${t.reflectionRevision} = 0 and ${t.reflectionFeeling} is null and ${t.reflectionText} is null) or (${t.status} = 'completed' and ${t.reflectionRevision} > 0 and (${t.reflectionFeeling} is not null or ${t.reflectionText} is not null))`,
      ),
      check(
        'attempt_reflection_feeling',
        sql`${t.reflectionFeeling} is null or ${t.reflectionFeeling} in ('a_lot_worse','a_little_worse','about_the_same','a_little_better','a_lot_better')`,
      ),
      check(
        'attempt_reflection_text_length',
        sql`${t.reflectionText} is null or char_length(${t.reflectionText}) <= 10000`,
      ),
      ...ownerPolicies(),
    ],
  )
  .enableRLS();

export const attemptPatchReceipts = appSchema
  .table(
    'attempt_patch_receipts',
    {
      userId: uuid('user_id').notNull(),
      id: uuid().notNull(),
      attemptId: uuid('attempt_id').notNull(),
      inputDigest: text('input_digest').notNull(),
      appliedRevision: integer('applied_revision').notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.userId, t.id] }),
      foreignKey({
        name: 'attempt_patch_receipts_attempt_fk',
        columns: [t.userId, t.attemptId],
        foreignColumns: [attempts.userId, attempts.id],
      }),
      index('attempt_patch_receipts_attempt_idx').on(t.userId, t.attemptId),
      check('attempt_patch_digest', sql`${t.inputDigest} ~ '^[a-f0-9]{64}$'`),
      check('attempt_patch_revision', sql`${t.appliedRevision} > 0`),
      ...ownerPolicies(),
    ],
  )
  .enableRLS();

export const reflections = appSchema
  .table(
    'reflections',
    {
      userId: uuid('user_id').notNull(),
      attemptId: uuid('attempt_id').notNull(),
      revision: integer().notNull().default(1),
      status: text().notNull(),
      feelingVersion: integer('feeling_version').notNull().default(1),
      feeling: text(),
      reflectionText: text('reflection_text'),
      inputMethod: text('input_method'),
      updatedAt: time('updated_at').notNull().defaultNow(),
    },
    (t) => [
      primaryKey({
        name: 'reflections_pkey',
        columns: [t.userId, t.attemptId],
      }),
      foreignKey({
        name: 'reflections_user_id_attempt_id_fkey',
        columns: [t.userId, t.attemptId],
        foreignColumns: [attempts.userId, attempts.id],
      }),
      check('reflection_revision_positive', sql`${t.revision} > 0`),
      check('reflection_scale_version', sql`${t.feelingVersion} = 1`),
      check(
        'reflection_status',
        sql`${t.status} in ('draft','submitted','skipped')`,
      ),
      check(
        'reflection_feeling',
        sql`${t.feeling} is null or ${t.feeling} in ('a_lot_worse','a_little_worse','about_the_same','a_little_better','a_lot_better')`,
      ),
      check(
        'reflection_input_method',
        sql`(${t.reflectionText} is null and ${t.inputMethod} is null) or (${t.reflectionText} is not null and ${t.inputMethod} = 'typed')`,
      ),
      check(
        'reflection_terminal_content',
        sql`(${t.status} = 'draft') or (${t.status} = 'skipped' and ${t.feeling} is null and ${t.reflectionText} is null) or (${t.status} = 'submitted' and (${t.feeling} is not null or ${t.reflectionText} is not null))`,
      ),
      check(
        'reflection_text_length',
        sql`${t.reflectionText} is null or char_length(${t.reflectionText}) <= 10000`,
      ),
      ...ownerPolicies(),
    ],
  )
  .enableRLS();

export const reflectionActions = appSchema
  .table(
    'reflection_actions',
    {
      userId: uuid('user_id').notNull(),
      id: uuid().notNull(),
      attemptId: uuid('attempt_id').notNull(),
      action: text().notNull(),
      inputDigest: text('input_digest').notNull(),
      response: jsonb().notNull(),
    },
    (t) => [
      primaryKey({
        name: 'reflection_actions_pkey',
        columns: [t.userId, t.id],
      }),
      foreignKey({
        name: 'reflection_actions_user_id_attempt_id_fkey',
        columns: [t.userId, t.attemptId],
        foreignColumns: [attempts.userId, attempts.id],
      }),
      check(
        'reflection_action_kind',
        sql`${t.action} in ('draft','final','skip')`,
      ),
      check(
        'reflection_action_digest',
        sql`${t.inputDigest} ~ '^[a-f0-9]{64}$'`,
      ),
      index('reflection_actions_attempt_idx').on(t.userId, t.attemptId),
      ...ownerPolicies(),
    ],
  )
  .enableRLS();
