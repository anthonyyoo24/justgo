import assert from 'node:assert/strict';
import test from 'node:test';
import { seedStartTimes } from '../../e2e/support/seed-times.ts';

const start = Date.UTC(2026, 9, 15);
const end = start + 86_400_000;

function assertInsideDay(times, latest) {
  assert.ok(times.every((time) => time >= start && time < latest));
  for (let n = 1; n < times.length; n++) assert.ok(times[n] > times[n - 1]);
}

test('seeds just after local midnight stay on today (hosted run 38660201918)', () => {
  const now = start + 33 * 60_000 + 44_000;
  const times = seedStartTimes(41, { start, end, now });
  assert.equal(times.length, 41);
  assertInsideDay(times, now);
});

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
