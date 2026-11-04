import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { setTimeout as pause } from 'node:timers/promises';
import test from 'node:test';
import { verifyPublicStagingProbes } from './staging-public-probes.mjs';
import { stagingRunnerFailureCode } from './staging-api.mjs';

const origin = 'https://justgo-api-staging.fixture.workers.dev';
const candidateSha = 'a'.repeat(40);
const previousSha = 'b'.repeat(40);
const paths = [
  '/health',
  '/ready',
  '/v1/journal-sync?limit=1',
  '/v1/completion-restores?limit=1',
];
const requestId = '12345678-1234-4234-8234-123456789012';

function response(path, source = candidateSha) {
  return {
    status: path.startsWith('/v1/') ? 401 : 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      'x-request-id': requestId,
      ...(path.startsWith('/v1/')
        ? {}
        : {
            'x-justgo-source-sha': source,
            'x-justgo-environment': 'staging',
          }),
    },
    body: JSON.stringify(
      path === '/health'
        ? { status: 'ok', service: 'justgo-api' }
        : path === '/ready'
          ? { status: 'ready' }
          : { code: 'UNAUTHORIZED', requestId },
    ),
  };
}

function fixture(t) {
  let clock = 0;
  const calls = [],
    waits = [],
    signals = new Set(),
    timers = new Set();
  let cleared = 0;
  const options = {
    origin,
    candidateSha,
    previousSha,
    now: () => clock,
    schedule: (callback, milliseconds) => {
      assert.equal(milliseconds, 30_000);
      const timer = { callback };
      timers.add(timer);
      return timer;
    },
    cancel: (timer) => {
      assert(timers.delete(timer));
      cleared++;
    },
    probe: async (requestedOrigin, path, { signal }) => {
      assert.equal(requestedOrigin, origin);
      assert.equal(signal.aborted, false);
      signals.add(signal);
      calls.push(path);
      return response(path);
    },
    wait: async (milliseconds, value, { signal }) => {
      assert.equal(value, undefined);
      assert.equal(signal.aborted, false);
      signals.add(signal);
      waits.push(milliseconds);
      clock += milliseconds;
    },
  };
  t.after(() => {
    assert.equal(timers.size, 0, 'the overall deadline is removed');
    assert.equal(cleared, 1);
    for (const signal of signals) {
      assert.equal(getEventListeners(signal, 'abort').length, 0);
      assert.equal(signal.aborted, true, 'owned cancellation is closed');
    }
    if (options.signal)
      assert.equal(getEventListeners(options.signal, 'abort').length, 0);
  });
  return {
    options,
    calls,
    waits,
    advance: (milliseconds) => {
      clock += milliseconds;
    },
    elapsed: () => clock,
    expire: () => {
      clock = 30_000;
      assert.equal(timers.size, 1);
      [...timers][0].callback();
    },
  };
}

function failure(code) {
  return (error) => {
    assert.equal(stagingRunnerFailureCode(error), code);
    assert.equal(error.message, code);
    assert(!JSON.stringify(error).includes('PRIVATE_PROVIDER_CONTENT'));
    return true;
  };
}

test('an immediate candidate completes exactly one full round without waiting', async (t) => {
  const f = fixture(t);
  await verifyPublicStagingProbes(f.options);
  assert.deepEqual(f.calls, paths);
  assert.deepEqual(f.waits, []);
});

for (const oldPaths of [['/health'], ['/ready'], ['/health', '/ready']])
  test(`valid previous ${oldPaths.join(' and ')} requires a complete final candidate round`, async (t) => {
    const f = fixture(t),
      probe = f.options.probe;
    f.options.probe = async (...args) => {
      const result = await probe(...args);
      if (f.calls.length <= 4 && oldPaths.includes(args[1]))
        result.headers['x-justgo-source-sha'] = previousSha;
      return result;
    };
    await verifyPublicStagingProbes(f.options);
    assert.deepEqual(f.calls, [...paths, ...paths]);
    assert.deepEqual(f.waits, [2000]);
  });

test('candidate health and readiness from different rounds cannot establish success', async (t) => {
  const f = fixture(t),
    probe = f.options.probe;
  f.options.probe = async (...args) => {
    const result = await probe(...args);
    if (
      (f.calls.length <= 4 && args[1] === '/ready') ||
      (f.calls.length > 4 && f.calls.length <= 8 && args[1] === '/health')
    )
      result.headers['x-justgo-source-sha'] = previousSha;
    return result;
  };
  await verifyPublicStagingProbes(f.options);
  assert.deepEqual(f.calls, [...paths, ...paths, ...paths]);
  assert.deepEqual(f.waits, [2000, 2000]);
});

test('persistent valid previous responses exhaust one budget including network and waits', async (t) => {
  const f = fixture(t),
    probe = f.options.probe;
  f.options.probe = async (...args) => {
    const result = await probe(...args);
    f.advance(500);
    if (!args[1].startsWith('/v1/'))
      result.headers['x-justgo-source-sha'] = previousSha;
    return result;
  };
  await assert.rejects(
    verifyPublicStagingProbes(f.options),
    failure('STAGING_RUNTIME_IDENTITY_MISMATCH'),
  );
  assert.equal(f.elapsed(), 30_000);
  assert.equal(f.calls.length, 32);
  assert.equal(
    f.waits.reduce((sum, milliseconds) => sum + milliseconds, 0),
    14_000,
  );
});

test('the final propagation wait is clipped to the remaining overall budget', async (t) => {
  const f = fixture(t),
    probe = f.options.probe;
  f.options.probe = async (...args) => {
    const result = await probe(...args);
    if (args[1] === '/health') {
      f.advance(29_000);
      result.headers['x-justgo-source-sha'] = previousSha;
    }
    return result;
  };
  await assert.rejects(
    verifyPublicStagingProbes(f.options),
    failure('STAGING_RUNTIME_IDENTITY_MISMATCH'),
  );
  assert.deepEqual(f.calls, paths);
  assert.deepEqual(f.waits, [1000]);
  assert.equal(f.elapsed(), 30_000);
});

const invalidCases = [
  [
    'unknown source',
    (r) => {
      r.headers['x-justgo-source-sha'] = 'c'.repeat(40);
    },
    'STAGING_RUNTIME_IDENTITY_MISMATCH',
  ],
  [
    'missing source',
    (r) => {
      delete r.headers['x-justgo-source-sha'];
    },
    'STAGING_RUNTIME_IDENTITY_MISMATCH',
  ],
  [
    'previous with wrong environment',
    (r) => {
      r.headers['x-justgo-source-sha'] = previousSha;
      r.headers['x-justgo-environment'] = 'production';
    },
    'STAGING_RUNTIME_IDENTITY_MISMATCH',
  ],
  [
    'malformed JSON',
    (r) => {
      r.body = 'PRIVATE_PROVIDER_CONTENT';
    },
    'INVALID_STAGING_PROBE',
  ],
  [
    'malformed previous body',
    (r) => {
      r.headers['x-justgo-source-sha'] = previousSha;
      r.body = JSON.stringify({ status: 'ok', service: 'wrong' });
    },
    'STAGING_RUNTIME_IDENTITY_MISMATCH',
  ],
  [
    'malformed candidate body',
    (r) => {
      r.body = JSON.stringify({ status: 'unavailable' });
    },
    'STAGING_HEALTH_FAILED',
  ],
  [
    'previous with cacheable headers',
    (r) => {
      r.headers['x-justgo-source-sha'] = previousSha;
      r.headers['cache-control'] = 'public';
    },
    'INVALID_STAGING_PROBE_HEADERS',
  ],
  [
    'non-200 previous',
    (r) => {
      r.headers['x-justgo-source-sha'] = previousSha;
      r.status = 503;
    },
    'STAGING_HEALTH_FAILED',
  ],
];
for (const [label, mutate, code] of invalidCases)
  test(`${label} fails immediately without a propagation wait`, async (t) => {
    const f = fixture(t),
      probe = f.options.probe;
    f.options.probe = async (...args) => {
      const result = await probe(...args);
      mutate(result);
      return result;
    };
    await assert.rejects(verifyPublicStagingProbes(f.options), failure(code));
    assert.deepEqual(f.calls, ['/health']);
    assert.deepEqual(f.waits, []);
  });

test('an authentication failure stops a round even after valid previous health', async (t) => {
  const f = fixture(t),
    probe = f.options.probe;
  f.options.probe = async (...args) => {
    const result = await probe(...args);
    if (args[1] === '/health')
      result.headers['x-justgo-source-sha'] = previousSha;
    if (args[1] === paths[3]) result.status = 200;
    return result;
  };
  await assert.rejects(
    verifyPublicStagingProbes(f.options),
    failure('STAGING_AUTH_FENCE_FAILED'),
  );
  assert.deepEqual(f.calls, paths);
  assert.deepEqual(f.waits, []);
});

test('a network failure after valid previous health is redacted and never retried', async (t) => {
  const f = fixture(t),
    probe = f.options.probe;
  f.options.probe = async (...args) => {
    const result = await probe(...args);
    if (args[1] === '/health')
      result.headers['x-justgo-source-sha'] = previousSha;
    else throw new Error('PRIVATE_PROVIDER_CONTENT');
    return result;
  };
  await assert.rejects(
    verifyPublicStagingProbes(f.options),
    failure('INVALID_STAGING_PROBE'),
  );
  assert.deepEqual(f.calls, paths.slice(0, 2));
  assert.deepEqual(f.waits, []);
});

test('an already lost lease sends no probe', async (t) => {
  const f = fixture(t),
    lease = new AbortController();
  f.options.signal = lease.signal;
  lease.abort();
  await assert.rejects(
    verifyPublicStagingProbes(f.options),
    failure('STAGING_DATABASE_LEASE_LOST'),
  );
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.waits, []);
});

for (const cancellation of ['lease', 'deadline'])
  test(`${cancellation} aborts a stalled probe and late success cannot continue`, async (t) => {
    const f = fixture(t),
      lease = new AbortController();
    f.options.signal = lease.signal;
    const entered = Promise.withResolvers(),
      pending = Promise.withResolvers();
    const probe = f.options.probe;
    f.options.probe = async (...args) => {
      const result = await probe(...args);
      entered.resolve();
      await pending.promise;
      return result;
    };
    const rejected = assert.rejects(
      verifyPublicStagingProbes(f.options),
      failure(
        cancellation === 'lease'
          ? 'STAGING_DATABASE_LEASE_LOST'
          : 'INVALID_STAGING_PROBE',
      ),
    );
    await entered.promise;
    if (cancellation === 'lease') lease.abort();
    else f.expire();
    await rejected;
    pending.resolve();
    await pending.promise;
    await Promise.resolve();
    assert.deepEqual(f.calls, ['/health']);
    assert.deepEqual(f.waits, []);
  });

for (const cancellation of ['lease', 'deadline'])
  test(`${cancellation} aborts a stalled propagation wait without another round`, async (t) => {
    const f = fixture(t),
      lease = new AbortController();
    f.options.signal = lease.signal;
    const probe = f.options.probe,
      wait = f.options.wait;
    const entered = Promise.withResolvers(),
      pending = Promise.withResolvers();
    f.options.probe = async (...args) => {
      const result = await probe(...args);
      if (args[1] === '/health')
        result.headers['x-justgo-source-sha'] = previousSha;
      return result;
    };
    f.options.wait = async (...args) => {
      await wait(...args);
      entered.resolve();
      await pending.promise;
    };
    const rejected = assert.rejects(
      verifyPublicStagingProbes(f.options),
      failure(
        cancellation === 'lease'
          ? 'STAGING_DATABASE_LEASE_LOST'
          : 'STAGING_RUNTIME_IDENTITY_MISMATCH',
      ),
    );
    await entered.promise;
    if (cancellation === 'lease') lease.abort();
    else f.expire();
    await rejected;
    pending.reject(new Error('PRIVATE_PROVIDER_CONTENT'));
    await pending.promise.catch(() => {});
    await Promise.resolve();
    assert.deepEqual(f.calls, paths);
    assert.deepEqual(f.waits, [2000]);
  });

test('lease cancellation also cleans up the real abortable propagation timer', async (t) => {
  const f = fixture(t),
    lease = new AbortController();
  f.options.signal = lease.signal;
  const probe = f.options.probe,
    entered = Promise.withResolvers();
  f.options.probe = async (...args) => {
    const result = await probe(...args);
    if (args[1] === '/health')
      result.headers['x-justgo-source-sha'] = previousSha;
    return result;
  };
  let pendingWait;
  f.options.wait = (...args) => {
    const pending = pause(...args);
    pendingWait = pending;
    entered.resolve();
    return pending;
  };
  const rejected = assert.rejects(
    verifyPublicStagingProbes(f.options),
    failure('STAGING_DATABASE_LEASE_LOST'),
  );
  await entered.promise;
  lease.abort();
  await rejected;
  await assert.rejects(pendingWait, { name: 'AbortError' });
  assert.deepEqual(f.calls, paths);
});
