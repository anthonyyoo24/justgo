import { sql } from 'drizzle-orm';
import {
  text,
  integer,
  index,
  uniqueIndex,
  check,
  pgPolicy,
  boolean,
} from 'drizzle-orm/pg-core';
import { appSchema, maintenance } from './shared.ts';

const catalogPolicies = () => [
  maintenance(),
  pgPolicy('catalog_read', {
    for: 'select',
    to: 'justgo_runtime',
    using: sql`(select justgo.current_user_id()) is not null or current_setting('app.guest_catalog',true) = 'on'`,
  }),
];

// Catalog wording is canonical; historical attempts retain their recorded references.
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
export const venueCards = appSchema
  .table(
    'venue_cards',
    {
      id: text().primaryKey(),
      venueId: text('venue_id')
        .notNull()
        .references(() => venues.id),
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
