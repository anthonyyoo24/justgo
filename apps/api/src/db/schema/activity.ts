import { sql } from 'drizzle-orm';
import {
  uuid,
  text,
  integer,
  index,
  primaryKey,
  foreignKey,
  check,
  jsonb,
} from 'drizzle-orm/pg-core';
import type { Reflection, CompletionAttempt } from '@justgo/contracts';
import { challenges, levels, venues } from './catalog.ts';
import { users } from './identity.ts';
import { appSchema, ownerPolicies, time } from './shared.ts';

export const attempts = appSchema
  .table(
    'attempts',
    {
      userId: uuid('user_id')
        .notNull()
        .references(() => users.id),
      id: uuid().notNull(),
      venueId: text('venue_id')
        .notNull()
        .references(() => venues.id),
      challengeId: text('challenge_id')
        .notNull()
        .references(() => challenges.id),
      levelId: text('level_id')
        .notNull()
        .references(() => levels.id),
      startedAt: time('started_at').notNull(),
      activityDate: text('activity_date').notNull(),
      startTimeZone: text('start_time_zone'),
      legacyDisplayTimeZone: text('legacy_display_time_zone'),
      instructionSnapshot: text('instruction_snapshot'),
      reflectionFeeling: text('reflection_feeling'),
      reflectionText: text('reflection_text'),
      reflectionRevision: integer('reflection_revision').notNull().default(0),
    },
    (t) => [
      primaryKey({ columns: [t.userId, t.id] }),
      index('attempt_history_day_idx').on(
        t.userId,
        t.activityDate,
        t.startedAt,
        t.id,
      ),
      index('attempt_challenge_idx').on(t.challengeId),
      check(
        'attempt_activity_date',
        sql`${t.activityDate} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
      ),
      check(
        'attempt_time_zone_attribution',
        sql`(${t.startTimeZone} is not null and ${t.legacyDisplayTimeZone} is null) or (${t.startTimeZone} is null and ${t.legacyDisplayTimeZone} is not null)`,
      ),
      check(
        'attempt_reflection_content',
        sql`(${t.reflectionRevision} = 0 and ${t.reflectionFeeling} is null and ${t.reflectionText} is null) or (${t.reflectionRevision} > 0 and (${t.reflectionFeeling} is not null or ${t.reflectionText} is not null))`,
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

export const journalVersions = appSchema
  .table(
    'journal_versions',
    {
      userId: uuid('user_id').notNull(),
      versionId: uuid('version_id').notNull(),
      attemptId: uuid('attempt_id').notNull(),
      parents: uuid('parents').array().notNull(),
      feelingScaleVersion: integer('feeling_scale_version').notNull(),
      reflection: jsonb('reflection').$type<Reflection>().notNull(),
      context: jsonb('context').$type<CompletionAttempt>(),
    },
    (t) => [
      primaryKey({ columns: [t.userId, t.versionId] }),
      foreignKey({ columns: [t.userId], foreignColumns: [users.id] }),
      index('journal_versions_attempt_idx').on(t.userId, t.attemptId),
      check('journal_version_scale', sql`${t.feelingScaleVersion}=1`),
      ...ownerPolicies(),
    ],
  )
  .enableRLS();

export const deletedCompletionIds = appSchema
  .table(
    'deleted_completion_ids',
    {
      userId: uuid('user_id')
        .notNull()
        .references(() => users.id),
      attemptId: uuid('attempt_id').notNull(),
    },
    (t) => [
      primaryKey({ columns: [t.userId, t.attemptId] }),
      ...ownerPolicies(),
    ],
  )
  .enableRLS();
