import { remainingSeconds } from './countdown';
const deadline = '2026-09-24T20:05:00.000Z';
it('uses elapsed wall time after navigation/backgrounding without resetting the deadline', () => {
  expect(
    remainingSeconds(deadline, Date.parse('2026-09-24T20:03:12Z'), 300),
  ).toBe(108);
  expect(
    remainingSeconds(deadline, Date.parse('2026-09-24T20:07:00Z'), 300),
  ).toBe(0);
});
it('never flashes above the original duration when the server clock offset updates between renders', () => {
  expect(
    remainingSeconds(deadline, Date.parse('2026-09-24T19:59:59.990Z'), 300),
  ).toBe(300);
});
