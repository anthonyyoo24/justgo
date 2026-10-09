import { describe, expect, it } from 'vitest';
import {
  catalogSchema,
  challengeCardSchema,
  timeZoneSchema,
  venueSchema,
} from '../index.js';
const card = {
  id: 'ST-01',
  challengeId: 'st-01',
  levelId: 'level-1',
  venue: 'streets',
  position: 0,
  text: 'Say hello.',
  subtext: null,
  durationSeconds: 300,
};
describe('canonical challenge catalog contracts', () => {
  it('validates ordered placements without obsolete revisions or queue state', () => {
    expect(catalogSchema.parse({ cards: [card] }).cards).toEqual([card]);
    for (const extra of [
      { revisionId: 'st-01-v1' },
      { userId: 'owner' },
      { position: -1 },
      { durationSeconds: 0 },
    ])
      expect(challengeCardSchema.safeParse({ ...card, ...extra }).success).toBe(
        false,
      );
  });
  it('accepts six named venues and IANA zones while rejecting offsets and unknown zones', () => {
    expect(venueSchema.options).toHaveLength(6);
    expect(venueSchema.safeParse('all').success).toBe(false);
    expect(timeZoneSchema.safeParse('America/Toronto').success).toBe(true);
    for (const zone of ['invalid/timezone', '+05:30'])
      expect(timeZoneSchema.safeParse(zone).success).toBe(false);
  });
});
