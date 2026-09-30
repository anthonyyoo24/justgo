import { calendarCells, completionTime, dayLabel, moveMonth } from './calendar';

it('navigates across year boundaries and makes Monday-first month grids without local date drift', () => {
  expect(moveMonth('2026-12', 1)).toBe('2027-01');
  expect(moveMonth('2027-01', -1)).toBe('2026-12');
  const september = calendarCells('2026-09');
  expect(september.slice(0, 2)).toEqual([null, '2026-09-01']);
  expect(september).toContain('2026-09-30');
  expect(september.length % 7).toBe(0);
  expect(dayLabel('2026-09-18')).toBe('Friday, September 18');
});

it('formats a completion in its frozen time zone', () => {
  expect(completionTime('2026-11-01T05:30:00Z', 'America/Toronto')).toBe(
    '1:30 AM',
  );
  expect(completionTime('2026-11-01T05:30:00Z', 'Europe/London')).toBe(
    '5:30 AM',
  );
});
