import { expect, it } from 'vitest';
import { calendarDateSchema, calendarMonthSchema } from './progress.ts';

it('rejects calendar dates PostgreSQL cannot represent', () => {
  expect(calendarMonthSchema.safeParse('0000-01').success).toBe(false);
  expect(calendarDateSchema.safeParse('0000-01-01').success).toBe(false);
  expect(calendarMonthSchema.safeParse('2026-09').success).toBe(true);
  expect(calendarDateSchema.safeParse('2026-09-18').success).toBe(true);
});
