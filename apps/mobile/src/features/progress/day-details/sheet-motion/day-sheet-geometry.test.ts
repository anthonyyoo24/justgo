import {
  daySheetDragHeight,
  daySheetHeights,
  daySheetRelease,
} from './day-sheet-geometry';
const measurements = {
  availableHeight: 860,
  windowHeight: 900,
  topInset: 40,
  bottomInset: 20,
  headerHeight: 140,
  firstRowHeight: 100,
  contentHeight: 1000,
  complete: true,
  fallbackHeight: 360,
};
it('opens short days at content height and long days with usable minimum, default and maximum heights', () => {
  expect(daySheetHeights({ ...measurements, contentHeight: 100 })).toEqual({
    minimum: 252,
    compact: 252,
    expanded: 252,
    maximum: 828,
  });
  expect(daySheetHeights(measurements)).toEqual({
    minimum: 252,
    compact: 580,
    expanded: 828,
    maximum: 828,
  });
  expect(daySheetHeights({ ...measurements, contentHeight: 500 })).toEqual({
    minimum: 252,
    compact: 580,
    expanded: 652,
    maximum: 828,
  });
});
it('retains space for unmounted batches and respects keyboard and rotation space', () => {
  expect(
    daySheetHeights({ ...measurements, contentHeight: 100, complete: false }),
  ).toEqual({ minimum: 252, compact: 580, expanded: 828, maximum: 828 });
  expect(daySheetHeights({ ...measurements, availableHeight: 350 })).toEqual({
    minimum: 252,
    compact: 318,
    expanded: 318,
    maximum: 318,
  });
  expect(daySheetHeights({ ...measurements, availableHeight: 0 }).maximum).toBe(
    828,
  );
});
it('uses a bounded fallback before measurement and keeps tiny windows positive', () => {
  expect(daySheetHeights({ ...measurements, contentHeight: 0 }).compact).toBe(
    340,
  );
  expect(daySheetHeights({ ...measurements, availableHeight: 20 })).toEqual({
    minimum: 1,
    compact: 1,
    expanded: 1,
    maximum: 1,
  });
});
it('follows the finger, resists extra upward travel and stops firmly at the minimum', () => {
  const bounds = daySheetHeights(measurements);
  expect(daySheetDragHeight(580, -100, bounds)).toBe(680);
  expect(daySheetDragHeight(580, 50, bounds)).toBe(530);
  expect(daySheetDragHeight(580, 1000, bounds)).toBe(252);
  const short = daySheetHeights({ ...measurements, contentHeight: 100 });
  expect(daySheetDragHeight(252, -100, short)).toBe(277);
  expect(daySheetDragHeight(252, -1000, short)).toBe(292);
  expect(daySheetDragHeight(828, -100, bounds)).toBe(828);
});
it('keeps the released height and never turns any downward distance into dismissal', () => {
  const bounds = daySheetHeights(measurements);
  expect(daySheetRelease(580, -100, bounds)).toBe(680);
  expect(daySheetRelease(828, 200, bounds)).toBe(628);
  expect(daySheetRelease(580, 25, bounds)).toBe(555);
  expect(daySheetRelease(580, 1000, bounds)).toBe(252);
  expect(daySheetRelease(580, -1000, bounds)).toBe(828);
  const four = daySheetHeights({ ...measurements, contentHeight: 360 });
  expect(daySheetRelease(four.compact, 25, four)).toBe(487);
  expect(daySheetRelease(four.compact, 1000, four)).toBe(four.minimum);
});

it('fits exactly the header and one full measured row, including wrapped or scaled content', () => {
  const normal = daySheetHeights(measurements);
  const wrapped = daySheetHeights({ ...measurements, firstRowHeight: 180 });
  expect(normal.minimum).toBe(measurements.headerHeight + 12 + 100);
  expect(wrapped.minimum).toBe(measurements.headerHeight + 12 + 180);
  expect(daySheetHeights({ ...measurements, firstRowHeight: 0 }).minimum).toBe(
    340,
  );
  expect(
    daySheetHeights({ ...measurements, firstRowHeight: 2000 }).minimum,
  ).toBe(normal.maximum);
});
