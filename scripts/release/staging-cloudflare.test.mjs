import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudflareRequest, workerProbe } from './staging-cloudflare.mjs';
import { stagingRunnerFailureCode } from './staging-api.mjs';
const target = {
  accountId: '1'.repeat(32),
  worker: 'justgo-api-staging',
  hyperdriveId: '2'.repeat(32),
};
const token = 'private-token';
const safe = (error) => {
  assert.ok(stagingRunnerFailureCode(error));
  assert.ok(!error.message.includes(token));
  assert.ok(!error.message.includes('PRIVATE_PROVIDER_CONTENT'));
  return true;
};
test('provider transport scopes the URL, keeps credentials in memory, and disables redirects', async () => {
  const calls = [];
  const value = await cloudflareRequest(target, '/versions', {
    token,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ success: true, result: { items: [] } });
    },
  });
  assert.deepEqual(value, { items: [] });
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    `https://api.cloudflare.com/client/v4/accounts/${target.accountId}/workers/scripts/justgo-api-staging/versions`,
  );
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.authorization, `Bearer ${token}`);
});
test('script-level diagnostics use the exact read-only endpoint without a subdomain API-date header', async () => {
  const settings = { observability: null, logpush: false, tail_consumers: [] };
  let calls = 0;
  const fetch = async (url, options) => {
    calls++;
    assert.equal(
      url,
      `https://api.cloudflare.com/client/v4/accounts/${target.accountId}/workers/scripts/justgo-api-staging/script-settings`,
    );
    assert.equal(options.method, 'GET');
    assert.equal(
      options.headers['Cloudflare-Workers-Script-Api-Date'],
      undefined,
    );
    return Response.json({ success: true, result: settings });
  };
  assert.deepEqual(
    await cloudflareRequest(target, '/script-settings', { token, fetch }),
    settings,
  );
  for (const options of [
    { method: 'POST' },
    { method: 'PATCH' },
    { method: 'DELETE' },
    { allowMissing: true },
  ])
    await assert.rejects(
      cloudflareRequest(target, '/script-settings', {
        token,
        fetch,
        ...options,
      }),
      safe,
    );
  for (const path of ['/script-settings/extra', '/script-settings?unsafe=true'])
    await assert.rejects(
      cloudflareRequest(target, path, { token, fetch }),
      safe,
    );
  assert.equal(calls, 1);
});
for (const failure of ['transport', 'status', 'json', 'oversize', 'envelope'])
  test(`provider ${failure} failure is bounded, redacted and never retried`, async () => {
    let calls = 0;
    await assert.rejects(
      cloudflareRequest(target, '/versions?bindings_inherit=strict', {
        token,
        method: 'POST',
        fetch: async () => {
          calls++;
          if (failure === 'transport')
            throw new Error('PRIVATE_PROVIDER_CONTENT');
          if (failure === 'status')
            return new Response('PRIVATE_PROVIDER_CONTENT', { status: 503 });
          if (failure === 'json')
            return new Response('PRIVATE_PROVIDER_CONTENT');
          if (failure === 'oversize')
            return new Response('x'.repeat(1024 * 1024 + 1));
          return Response.json({
            success: false,
            errors: ['PRIVATE_PROVIDER_CONTENT'],
          });
        },
      }),
      safe,
    );
    assert.equal(calls, 1);
  });
test('pre-aborted lease and unapproved provider path never send a request', async () => {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return new Response();
  };
  await assert.rejects(
    cloudflareRequest(target, '/versions', {
      token,
      signal: AbortSignal.abort(),
      fetch,
    }),
    safe,
  );
  await assert.rejects(
    cloudflareRequest(target, '/../../other-account', { token, fetch }),
    safe,
  );
  assert.equal(calls, 0);
});
test('probe requests carry no auth header, reject oversized responses and do not follow redirects', async () => {
  const result = await workerProbe('https://fixture.workers.dev', '/health', {
    fetch: async (_url, options) => {
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers, undefined);
      return Response.json(
        { status: 'ok' },
        { headers: { 'cache-control': 'no-store' } },
      );
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.headers['cache-control'], 'no-store');
  await assert.rejects(
    workerProbe('https://fixture.workers.dev', '/health', {
      fetch: async () => new Response('x'.repeat(4097)),
    }),
    safe,
  );
});

test('bootstrap absence accepts only a scoped missing-Worker 404, never generic provider failures', async () => {
  const missing = { success: false, errors: [{ code: 10007 }] };
  assert.equal(
    await cloudflareRequest(target, '/settings', {
      token,
      allowMissing: true,
      fetch: async () => Response.json(missing, { status: 404 }),
    }),
    null,
  );
  for (const [status, body] of [
    [403, missing],
    [404, { success: false, errors: [{ code: 10000 }] }],
    [404, { ...missing, errors: [...missing.errors, { code: 10000 }] }],
  ])
    await assert.rejects(
      cloudflareRequest(target, '/settings', {
        token,
        allowMissing: true,
        fetch: async () => Response.json(body, { status }),
      }),
      safe,
    );
  let calls = 0;
  await assert.rejects(
    cloudflareRequest(target, '/versions', {
      token,
      allowMissing: true,
      fetch: async () => {
        calls++;
        return Response.json(missing, { status: 404 });
      },
    }),
    safe,
  );
  assert.equal(calls, 0);
});

test('initial upload is scoped, conditional, non-retried and uncertain on a lost response', async () => {
  let calls = 0;
  await assert.rejects(
    cloudflareRequest(target, '?excludeScript=true&bindings_inherit=strict', {
      token,
      method: 'PUT',
      body: new FormData(),
      fetch: async (url, options) => {
        calls++;
        assert.equal(
          url,
          `https://api.cloudflare.com/client/v4/accounts/${target.accountId}/workers/scripts/justgo-api-staging?excludeScript=true&bindings_inherit=strict`,
        );
        assert.equal(options.method, 'PUT');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers['if-none-match'], '*');
        throw new Error('PRIVATE_PROVIDER_CONTENT');
      },
    }),
    (error) => {
      assert.equal(
        stagingRunnerFailureCode(error),
        'STAGING_BOOTSTRAP_UNCONFIRMED',
      );
      return safe(error);
    },
  );
  assert.equal(calls, 1);
});
