import { pgSchema } from 'drizzle-orm/pg-core';

// Private schema. Tables, indexes and their RLS policies arrive with each feature.
export const appSchema = pgSchema('justgo');
