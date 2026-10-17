import type { Venue } from '@justgo/contracts';

// Deterministic Paper copy for repeatable comparisons, isolated from saved activity.
const references: Record<Venue, string> = {
  streets: 'Say hello to someone on your walk.',
  park: 'Say hello to someone on your walk.',
  gym: 'Say hello to someone between sets.',
  cafe: 'Ask someone for their favorite local spot.',
  bookstore: 'Ask someone for a book recommendation.',
  bars: 'Introduce yourself to someone new.',
};

// Include these development examples when checking native card copy length.
export function previewCardsForVenue(venue: Venue) {
  return [
    { id: 'reference', text: references[venue] },
    {
      id: 'long-text',
      text: 'Ask someone nearby for a place they like in the neighborhood.',
    },
    { id: 'short-text', text: 'Say hello to someone nearby.' },
  ];
}
