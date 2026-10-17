import { catalog } from '../../../../test-support/challenge-catalog';
import { reconcileDeckOrder } from './deck-order';

const cards = catalog.cards.filter((card) => card.venue === 'streets');
it('shuffles a new venue once using controllable randomness without mutating the catalog', () => {
  const random = jest.fn(() => 0);
  const result = reconcileDeckOrder(cards, undefined, random);
  expect(result.map((card) => card.id)).toEqual(['streets-1', 'streets-0']);
  expect(cards.map((card) => card.id)).toEqual(['streets-0', 'streets-1']);
  expect(random).toHaveBeenCalledTimes(1);
  random.mockClear();
  expect(
    reconcileDeckOrder(
      cards,
      result.map((card) => card.id),
      random,
    ),
  ).toEqual(result);
  expect(random).not.toHaveBeenCalled();
});
it('refreshes wording, removes absent placements and randomly inserts additions behind the surviving front', () => {
  const extra = { ...cards[0]!, id: 'new', position: 2 };
  const refreshed = [{ ...cards[1]!, text: 'Updated' }, extra];
  const result = reconcileDeckOrder(
    refreshed,
    ['streets-1', 'streets-0'],
    () => 0,
  );
  expect(result).toEqual([refreshed[0], extra]);
  expect(result[0]?.text).toBe('Updated');
});
it('supports different insertion positions without changing the saved cycle', () => {
  const added = { ...cards[0]!, id: 'new', position: 2 };
  expect(
    reconcileDeckOrder(
      [...cards, added],
      ['streets-1', 'streets-0'],
      () => 0,
    ).map((c) => c.id),
  ).toEqual(['streets-1', 'new', 'streets-0']);
  expect(
    reconcileDeckOrder(
      [...cards, added],
      ['streets-1', 'streets-0'],
      () => 0.99,
    ).map((c) => c.id),
  ).toEqual(['streets-1', 'streets-0', 'new']);
});
it('reshuffles when all saved placements disappeared and never fabricates empty-venue cards', () => {
  expect(reconcileDeckOrder(cards, ['removed'], () => 0)).toEqual(
    [...cards].reverse(),
  );
  expect(reconcileDeckOrder([], ['removed'], () => 0)).toEqual([]);
  expect(reconcileDeckOrder([cards[0]!], undefined, () => 0)).toEqual([
    cards[0],
  ]);
});
