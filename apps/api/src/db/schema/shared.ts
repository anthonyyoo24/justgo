import { sql } from 'drizzle-orm';
import { pgPolicy, pgSchema, timestamp } from 'drizzle-orm/pg-core';

// Private schema. Tables, indexes and their RLS policies arrive with each feature.
export const appSchema = pgSchema('justgo');
export const time = (name: string) => timestamp(name, { withTimezone: true });
export const maintenance = () =>
  pgPolicy('migration_maintenance', {
    to: 'justgo_migrator',
    using: sql`true`,
    withCheck: sql`true`,
  });
export const ownerPolicies = (column = 'user_id') => [
  maintenance(),
  pgPolicy('owner_access', {
    to: 'justgo_runtime',
    using: sql.raw(`${column} = (select justgo.current_user_id())`),
    withCheck: sql.raw(`${column} = (select justgo.current_user_id())`),
  }),
];
