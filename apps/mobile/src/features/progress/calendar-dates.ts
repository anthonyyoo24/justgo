export function currentMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function moveMonth(month: string, offset: number) {
  const [year, number] = month.split('-').map(Number);
  const next = new Date(Date.UTC(year!, number! - 1 + offset, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function calendarCells(month: string): (string | null)[] {
  const [year, number] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year!, number! - 1, 1));
  const pad = (first.getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year!, number!, 0)).getUTCDate();
  const cells: (string | null)[] = Array(pad).fill(null);
  for (let day = 1; day <= count; day++)
    cells.push(`${month}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export function monthLabel(month: string) {
  const [year, number] = month.split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, number! - 1, 1)));
}

export function dayLabel(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year!, month! - 1, day)));
}

/**
 * Format a captured ISO start instant in its supplied historical display zone.
 * This label never determines the frozen activity date or uses the device's zone.
 */
export function activityTime(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(new Date(iso));
}
