import { randomUUID } from 'node:crypto';

/** Preconfigured Sentry Cron monitors own missed-run alerts; no raw exception payload. */
export async function checkIn(
  dsn,
  slug,
  status,
  id = randomUUID().replaceAll('-', ''),
  send = fetch,
) {
  const url = new URL(dsn);
  if (
    url.protocol !== 'https:' ||
    !/^o\d+\.ingest(?:\.[a-z]+)?\.sentry\.io$/.test(url.hostname) ||
    !/^[a-f0-9]{32}$/.test(url.username) ||
    url.password ||
    !/^\/\d+$/.test(url.pathname) ||
    url.search ||
    url.hash ||
    !/^justgo-(staging|production)-(database|ledger)$/.test(slug) ||
    !['in_progress', 'ok', 'error'].includes(status)
  )
    throw new Error('Invalid backup monitor configuration');
  const endpoint = `https://${url.hostname}/api${url.pathname}/envelope/`;
  const payload = JSON.stringify({
    check_in_id: id,
    monitor_slug: slug,
    status,
  });
  const body = `${JSON.stringify({ dsn })}\n${JSON.stringify({ type: 'check_in', length: Buffer.byteLength(payload) })}\n${payload}\n`;
  const response = await send(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error('Backup monitor delivery failed');
  return id;
}
