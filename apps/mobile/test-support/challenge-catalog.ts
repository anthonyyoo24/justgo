import { venues, type Catalog } from '@justgo/contracts';
import { card } from './journal';

export const catalog: Catalog = {
  cards: venues.flatMap(({ id }) =>
    [0, 1].map((position) => ({
      ...card,
      venue: id,
      id: `${id}-${position}`,
      challengeId: `${id}-${position}`,
      position,
    })),
  ),
};
