const repository = 'anthonyyoo24/justgo';
const endpoint = `https://api.github.com/repos/${repository}/actions/workflows/database-backups.yml/dispatches`;
const schedules = new Map([
  ['43 4 * * *', 'database'],
  ['23 * * * *', 'ledger'],
]);
const failure = () =>
  new Error('Backup clock dispatch unconfirmed; inspect backup health');

async function readReceipt(response) {
  if (!response.body) throw failure();
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4096) throw failure();
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(body));
}

/**
 * Prepared Cron-only dispatcher. Its secret has repository Actions:write scope,
 * which GitHub cannot restrict to just this workflow. Activation needs owner
 * approval. It receives no database, R2, Auth or recovery-key credentials.
 * Dispatch acceptance never sends a healthy backup check-in and is never retried.
 */
export async function dispatchBackup(
  event,
  env,
  { fetch = globalThis.fetch, now = Date.now } = {},
) {
  try {
    const kind = schedules.get(event?.cron);
    const expiry = Date.parse(env.BACKUP_CLOCK_TOKEN_EXPIRES_AT);
    if (
      !kind ||
      env.BACKUP_CLOCK_ENABLED !== 'approved' ||
      !/^github_pat_[A-Za-z0-9_]{20,}$/.test(
        env.BACKUP_CLOCK_GITHUB_TOKEN ?? '',
      ) ||
      !Number.isFinite(expiry) ||
      expiry - now() < 20 * 60000 ||
      !Number.isSafeInteger(event.scheduledTime) ||
      event.scheduledTime < 1
    )
      throw failure();
    const scheduledAt = new Date(event.scheduledTime).toISOString();
    const response = await fetch(endpoint, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(8000),
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${env.BACKUP_CLOCK_GITHUB_TOKEN}`,
        'user-agent': 'justgo-staging-backup-clock',
        'x-github-api-version': '2026-03-10',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs: { kind } }),
    });
    // API version 2026-03-10 returns run details by default (the 2022 version
    // required return_run_details). Treat redirects and ambiguous receipts as unconfirmed.
    // https://docs.github.com/en/rest/actions/workflows?apiVersion=2026-03-10#create-a-workflow-dispatch-event
    if (response.status !== 200) {
      await response.body?.cancel().catch(() => {});
      throw failure();
    }
    const receipt = await readReceipt(response);
    const id = receipt?.workflow_run_id;
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      receipt.run_url !==
        `https://api.github.com/repos/${repository}/actions/runs/${id}` ||
      receipt.html_url !== `https://github.com/${repository}/actions/runs/${id}`
    )
      throw failure();
    return {
      event: 'backup_workflow_dispatched',
      kind,
      scheduledAt,
      runId: id,
      runUrl: receipt.html_url,
    };
  } catch {
    throw failure();
  }
}

export default {
  async scheduled(event, env) {
    console.log(JSON.stringify(await dispatchBackup(event, env)));
  },
  // No HTTP request may dispatch work, even if a route is added accidentally.
  fetch() {
    return new Response('Not found', { status: 404 });
  },
};
