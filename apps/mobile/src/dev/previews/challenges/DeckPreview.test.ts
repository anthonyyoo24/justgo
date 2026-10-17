import { venues } from '@justgo/contracts';
import { previewCardsForVenue } from './preview-copy';

it('uses the reviewed preview examples in every venue', () => {
  for (const venue of venues) {
    const cards = previewCardsForVenue(venue.id);
    expect(cards.map((card) => card.id)).toEqual([
      'reference',
      'long-text',
      'short-text',
    ]);
    expect(cards[1]?.text).toBe(
      'Ask someone nearby for a place they like in the neighborhood.',
    );
    expect(cards[2]?.text).toBe('Say hello to someone nearby.');
  }
});
