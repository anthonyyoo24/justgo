import assert from 'node:assert/strict';
import test from 'node:test';
import { seedDay, seedStartTimes } from '../../e2e/support/seed-times.ts';

const start = Date.UTC(2026, 9, 15);
const end = start + 86_400_000;

function assertInsideDay(times, latest) {
  assert.ok(times.every((time) => time >= start && time < latest));
  for (let n = 1; n < times.length; n++) assert.ok(times[n] > times[n - 1]);
}

for (const [count, elapsed] of [
  [41, 33 * 60_000 + 44_000], // Original hosted failure: 38660201918.
  [41, 13 * 60_000 + 30_000], // Split foundation failure: 38985045971.
  [21, 14 * 60_000 + 30_000],
]) {
  test(`${count} starts stay on today ${elapsed}ms after local midnight`, () => {
    const now = start + elapsed;
    const times = seedStartTimes(count, { start, end, now });
    assert.equal(times.length, count);
    assertInsideDay(times, now);
  });
}

test('seeds later in the day keep one minute between starts', () => {
  const now = start + 12 * 3_600_000;
  const times = seedStartTimes(41, { start, end, now });
  assert.equal(times[0], now - 41 * 60_000);
  assert.equal(times[40], now - 60_000);
});

test('earlier-day seeds stay inside that day', () => {
  const times = seedStartTimes(2, { start, end, now: end + 5 * 60_000 });
  assertInsideDay(times, end);
});

test('seeding refuses when the day cannot hold distinct past starts', () => {
  assert.throws(
    () => seedStartTimes(41, { start, end, now: start + 40 }),
    /Cannot seed 41 distinct starts/,
  );
});

for (const [year, month, date] of [
  [2026, 0, 1],
  [2026, 10, 1],
  [2026, 10, 17],
  [2028, 2, 1],
]) {
  test(`previous-month activity stays visible after one month step from ${year}-${month + 1}-${date}`, () => {
    const now = new Date(year, month, date, 0, 3).getTime();
    const day = seedDay('previous-month', now);
    const expected = new Date(year, month, 0);
    assert.equal(day.start, expected.getTime());
    assert.equal(day.end, new Date(year, month, 1).getTime());
    const [startedAt] = seedStartTimes(1, day);
    assert.ok(startedAt >= day.start && startedAt < day.end);
    assert.ok(startedAt < now);
  });
}
