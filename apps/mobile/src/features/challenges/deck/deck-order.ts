import type { ChallengeCard } from '@justgo/contracts';

/** Keep surviving placements in order, refreshing content from the catalog. */
export function reconcileDeckOrder(
  cards: readonly ChallengeCard[],
  saved: readonly string[] | undefined,
  random: () => number,
): ChallengeCard[] {
  const available = new Map(cards.map((card) => [card.id, card]));
  const retained: ChallengeCard[] = [];
  for (const id of saved ?? []) {
    const card = available.get(id);
    if (card) {
      retained.push(card);
      available.delete(id);
    }
  }
  const added = [...available.values()].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  if (!retained.length) {
    // Fisher–Yates runs only when this venue has no surviving saved order.
    for (let i = added.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [added[i], added[j]] = [added[j]!, added[i]!];
    }
    return added;
  }
  for (const card of added) {
    // Preserve the current front while inserting new cards around the cycle.
    const index = 1 + Math.floor(random() * retained.length);
    retained.splice(index, 0, card);
  }
  return retained;
}
