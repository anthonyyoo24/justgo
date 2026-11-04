import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import worker, { dispatchBackup } from './worker.mjs';

const now = Date.parse('2026-11-02T21:00:00Z');
const env = {
  BACKUP_CLOCK_ENABLED: 'approved',
  BACKUP_CLOCK_TOKEN_EXPIRES_AT: '2026-11-03T21:00:00Z',
  BACKUP_CLOCK_GITHUB_TOKEN: 'github_pat_synthetic_disposable_fixture',
};
const event = { cron: '23 * * * *', scheduledTime: now };
const id = 1234;
const receipt = {
  workflow_run_id: id,
  run_url: `https://api.github.com/repos/anthonyyoo24/justgo/actions/runs/${id}`,
  html_url: `https://github.com/anthonyyoo24/justgo/actions/runs/${id}`,
};
const failure = {
  message: 'Backup clock dispatch unconfirmed; inspect backup health',
};
function fixture(response = () => Response.json(receipt)) {
  const calls = [];
  return {
    calls,
    operations: {
      now: () => now,
      fetch: async (...args) => {
        calls.push(args);
        return response();
      },
    },
  };
}

test('both Cron events dispatch exactly one fixed main workflow and return its accepted identity', async (t) => {
  for (const [cron, kind] of [
    ['43 4 * * *', 'database'],
    ['23 * * * *', 'ledger'],
  ])
    await t.test(kind, async () => {
      const f = fixture();
      assert.deepEqual(
        await dispatchBackup({ ...event, cron }, env, f.operations),
        {
          event: 'backup_workflow_dispatched',
          kind,
          scheduledAt: new Date(now).toISOString(),
          runId: id,
          runUrl: receipt.html_url,
        },
      );
      assert.equal(f.calls.length, 1);
      const [url, options] = f.calls[0];
      assert.equal(
        url,
        'https://api.github.com/repos/anthonyyoo24/justgo/actions/workflows/database-backups.yml/dispatches',
      );
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'manual');
      assert.equal(
        options.headers.authorization,
        `Bearer ${env.BACKUP_CLOCK_GITHUB_TOKEN}`,
      );
      assert.equal(options.headers['x-github-api-version'], '2026-03-10');
      assert.ok(options.signal instanceof AbortSignal);
      assert.deepEqual(JSON.parse(options.body), {
        ref: 'main',
        inputs: { kind },
      });
    });
});

test('invalid schedules, disabled activation, broad token shape, expiry and time fail before network', async (t) => {
  const variants = [
    { event: { ...event, cron: '* * * * *' } },
    { event: { ...event, scheduledTime: NaN } },
    { event: { ...event, scheduledTime: Number.MAX_SAFE_INTEGER } },
    { env: { ...env, BACKUP_CLOCK_ENABLED: 'disabled' } },
    {
      env: { ...env, BACKUP_CLOCK_GITHUB_TOKEN: 'ghp_classic_or_owner_token' },
    },
    { env: { ...env, BACKUP_CLOCK_GITHUB_TOKEN: undefined } },
    { env: { ...env, BACKUP_CLOCK_TOKEN_EXPIRES_AT: 'unconfigured' } },
    {
      env: {
        ...env,
        BACKUP_CLOCK_TOKEN_EXPIRES_AT: new Date(now + 19 * 60000).toISOString(),
      },
    },
  ];
  for (const [i, variant] of variants.entries())
    await t.test(`case ${i}`, async () => {
      const f = fixture();
      await assert.rejects(
        dispatchBackup(
          variant.event ?? event,
          variant.env ?? env,
          f.operations,
        ),
        failure,
      );
      assert.deepEqual(f.calls, []);
    });
});

test('redirects, uncertain acceptance, provider errors, malformed and unrelated receipts never retry or expose data', async (t) => {
  const responses = [
    () =>
      new Response('private provider response', {
        status: 302,
        headers: { location: 'https://untrusted.invalid' },
      }),
    () => new Response(null, { status: 204 }),
    () => new Response('private provider response', { status: 401 }),
    () => new Response('private provider response', { status: 429 }),
    () => new Response('private provider response', { status: 500 }),
    () => new Response('private invalid JSON'),
    () => Response.json({ ...receipt, workflow_run_id: 1.5 }),
    () =>
      Response.json({
        ...receipt,
        html_url: 'https://github.com/another/repository/actions/runs/1234',
      }),
    () => Response.json({ ...receipt, run_url: 'https://untrusted.invalid' }),
    () => new Response('x'.repeat(4097)),
    () => {
      throw new Error(env.BACKUP_CLOCK_GITHUB_TOKEN);
    },
  ];
  for (const [i, response] of responses.entries())
    await t.test(`case ${i}`, async () => {
      const f = fixture(response);
      await assert.rejects(dispatchBackup(event, env, f.operations), failure);
      assert.equal(f.calls.length, 1);
    });
});

test('HTTP access has no trigger and prepared configuration remains disabled with no public URL', async () => {
  assert.equal(
    worker.fetch(new Request('https://example.invalid/trigger'), env).status,
    404,
  );
  const config = JSON.parse(
    await readFile(new URL('./wrangler.json', import.meta.url), 'utf8'),
  );
  assert.equal(config.vars.BACKUP_CLOCK_ENABLED, 'disabled');
  assert.equal(config.vars.BACKUP_CLOCK_TOKEN_EXPIRES_AT, 'unconfigured');
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.deepEqual(config.triggers.crons, ['43 4 * * *', '23 * * * *']);
  assert.equal(config.main, 'worker.mjs');
  assert.equal(config.hyperdrive, undefined);
  assert.equal(config.r2_buckets, undefined);
});
