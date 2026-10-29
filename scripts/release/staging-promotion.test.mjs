import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, request as httpRequest } from 'node:http';
import test from 'node:test';
import { promoteStagingCandidate } from './staging-promotion.mjs';
import { stagingRunnerFailureCode } from './staging-api.mjs';

const token = 'synthetic-promotion-token';
const deployment = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const target = { accountId: '1'.repeat(32), worker: 'justgo-api-staging' };
const path = `/client/v4/accounts/${target.accountId}/workers/scripts/${target.worker}/deployments`;
const safeFailure = (error) => {
  assert.equal(
    stagingRunnerFailureCode(error),
    'STAGING_PROMOTION_UNCONFIRMED',
  );
  assert.ok(!JSON.stringify(error).includes(token));
  assert.ok(!JSON.stringify(error).includes('PRIVATE_PROVIDER_CONTENT'));
  return true;
};

async function fixture(t, respond) {
  const requests = [];
  const received = Promise.withResolvers();
  const responseHeaders = Promise.withResolvers();
  const requestClosed = Promise.withResolvers();
  const server = createServer((incoming, response) => {
    requests.push({ method: incoming.method, path: incoming.url });
    assert.equal(incoming.headers.authorization, `Bearer ${token}`);
    let body = '';
    incoming.on('data', (chunk) => {
      body += chunk;
    });
    incoming.on('end', () => {
      assert.deepEqual(JSON.parse(body), {
        strategy: 'percentage',
        versions: [{ version_id: deployment, percentage: 100 }],
      });
      received.resolve();
      respond(incoming, response, server);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const constructions = [];
  const request = (url, options, callback) => {
    constructions.push(url.href);
    assert.equal(url.origin, 'https://api.cloudflare.com');
    assert.equal(url.pathname + url.search, path);
    assert.equal(options.method, 'POST');
    assert.equal(options.agent, false);
    assert.equal(options.rejectUnauthorized, true);
    // Only this test adapter redirects the fixed HTTPS destination to a local
    // HTTP fixture; production always uses node:https with normal TLS checks.
    const local = new URL(`http://127.0.0.1:${server.address().port}${path}`);
    const outgoing = httpRequest(local, options, (response) => {
      callback(response);
      responseHeaders.resolve();
    });
    outgoing.once('close', requestClosed.resolve);
    return outgoing;
  };
  return {
    request,
    requests,
    constructions,
    received: received.promise,
    responseHeaders: responseHeaders.promise,
    requestClosed: requestClosed.promise,
  };
}

for (const status of [200, 201])
  test(`one complete HTTP ${status} response is accepted without parsing its body`, async (t) => {
    const f = await fixture(t, (_incoming, response) => {
      response.writeHead(status, { 'content-type': 'application/json' });
      response.end(status === 201 ? '' : 'PRIVATE_PROVIDER_CONTENT, not JSON');
    });
    await promoteStagingCandidate(deployment, {
      target,
      token,
      request: f.request,
    });
    assert.deepEqual(f.requests, [{ method: 'POST', path }]);
    assert.equal(f.constructions.length, 1);
  });

for (const status of [202, 403, 429, 500, 503, 307, 308])
  test(`HTTP ${status} fails after one request, without retry or redirect`, async (t) => {
    const f = await fixture(t, (_incoming, response) => {
      response.writeHead(status, {
        location: '/must-not-be-followed',
        'retry-after': '0',
      });
      response.end('PRIVATE_PROVIDER_CONTENT');
    });
    await assert.rejects(
      promoteStagingCandidate(deployment, {
        target,
        token,
        request: f.request,
      }),
      safeFailure,
    );
    assert.deepEqual(f.requests, [{ method: 'POST', path }]);
    assert.equal(f.constructions.length, 1);
  });

for (const partial of [false, true])
  test(`accepted POST with ${partial ? 'truncated response' : 'lost response'} is never resent`, async (t) => {
    const f = await fixture(t, (incoming, response) => {
      if (partial) {
        response.writeHead(201, { 'content-length': '1000' });
        response.write('PRIVATE_PROVIDER_CONTENT');
        response.flushHeaders();
        setImmediate(() => incoming.socket.destroy());
      } else incoming.socket.destroy();
    });
    await assert.rejects(
      promoteStagingCandidate(deployment, {
        target,
        token,
        request: f.request,
      }),
      safeFailure,
    );
    assert.equal(f.requests.length, 1);
    assert.equal(f.constructions.length, 1);
  });

test('lease loss aborts an active request and a pre-aborted lease sends none', async (t) => {
  const f = await fixture(t, () => {});
  const controller = new AbortController();
  const rejected = assert.rejects(
    promoteStagingCandidate(deployment, {
      target,
      token,
      request: f.request,
      signal: controller.signal,
    }),
    safeFailure,
  );
  await f.received;
  controller.abort();
  await rejected;
  await assert.rejects(
    promoteStagingCandidate(deployment, {
      target,
      token,
      request: f.request,
      signal: controller.signal,
    }),
    safeFailure,
  );
  assert.equal(f.requests.length, 1);
  assert.equal(f.constructions.length, 1);
});

for (const headers of [false, true])
  test(`wall-clock deadline stops stalled ${headers ? 'response body' : 'headers'} without retrying`, async (t) => {
    const f = await fixture(t, (_incoming, response) => {
      if (headers) {
        response.writeHead(201, { 'content-length': '1000' });
        response.write('PRIVATE_PROVIDER_CONTENT');
        response.flushHeaders();
      }
    });
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const rejected = assert.rejects(
      promoteStagingCandidate(deployment, {
        target,
        token,
        request: f.request,
      }),
      safeFailure,
    );
    await (headers ? f.responseHeaders : f.received);
    t.mock.timers.tick(20_000);
    await rejected;
    assert.equal(f.requests.length, 1);
    assert.equal(f.constructions.length, 1);
  });

test('invalid target, credential, or deadline sends no request', async () => {
  let calls = 0;
  const request = () => {
    calls++;
    throw new Error('PRIVATE_PROVIDER_CONTENT');
  };
  for (const [id, options] of [
    ['dpl_candidate/other', { token }],
    ['dpl_candidate\n', { token }],
    ['dpl_candidate\r\n', { token }],
    [['dpl_candidate'], { token }],
    [deployment, { token: `${token}\r\nextra: private` }],
    [deployment, { token: '' }],
    [deployment, { token, timeoutMs: 20_001 }],
    [deployment, { token, timeoutMs: 0 }],
  ])
    await assert.rejects(
      promoteStagingCandidate(id, { target, ...options, request }),
      safeFailure,
    );
  assert.equal(calls, 0);
});

test(
  'deadline rejects an unsolicited upgrade after the request has already closed',
  { timeout: 5000 },
  async (t) => {
    const f = await fixture(t, (_incoming, response) => {
      response.writeHead(101, {
        connection: 'Upgrade',
        upgrade: 'unexpected-protocol',
      });
      response.end();
    });
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const rejected = assert.rejects(
      promoteStagingCandidate(deployment, {
        target,
        token,
        request: f.request,
      }),
      safeFailure,
    );
    await f.requestClosed;
    t.mock.timers.tick(20_000);
    await rejected;
    assert.equal(f.requests.length, 1);
    assert.equal(f.constructions.length, 1);
  },
);

test('synchronous transport errors are redacted and not retried', async () => {
  let calls = 0;
  await assert.rejects(
    promoteStagingCandidate(deployment, {
      target,
      token,
      request: () => {
        calls++;
        throw new Error('PRIVATE_PROVIDER_CONTENT');
      },
    }),
    safeFailure,
  );
  assert.equal(calls, 1);
});
