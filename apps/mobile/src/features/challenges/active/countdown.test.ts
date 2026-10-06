import { remainingSeconds } from './countdown';
const startedAt = '2026-09-24T20:00:00.000Z';
it('uses elapsed wall time after backgrounding without resetting the captured start', () => {
  expect(
    remainingSeconds(startedAt, Date.parse('2026-09-24T20:03:12Z'), 300),
  ).toBe(108);
  expect(
    remainingSeconds(startedAt, Date.parse('2026-09-24T20:07:00Z'), 300),
  ).toBe(0);
});
it('never flashes above the original duration if the wall clock moves before the original start', () => {
  expect(
    remainingSeconds(startedAt, Date.parse('2026-09-24T19:59:59.990Z'), 300),
  ).toBe(300);
});
