import assert from 'node:assert/strict';
import { drizzle } from 'drizzle-orm/node-postgres';
import { ownerTransactions } from '../src/db/owner-transaction.js';
import { createManagedAuthVerifier } from '../src/identity/managed-verifier.js';
import { createServerErrorReporter } from '../src/http/server-error-reporter.js';
import { serverDiagnosticConfiguration } from '../src/http/sentry-configuration.js';

/**
 * Exercise production adapters with the Edge runtime's native Request
 * validation. These transports stay in memory; synthetic credentials never
 * reach global fetch. Called only from the loopback-fenced Edge smoke wrapper,
 * never the release bundle.
 */
export async function checkOutboundAdapters() {
  const origin = 'https://synthetic-auth.invalid';
  const claims = {
    sub: 'f2f76fb3-9709-4805-a25f-48e04b887625',
    session_id: '866517e5-c31b-411a-b8b7-40f27cd24226',
    exp: Math.floor(Date.now() / 1000) + 3600,
    role: 'authenticated',
    aud: 'authenticated',
    iss: `${origin}/auth/v1`,
  };
  const token = `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
  let authCalls = 0;
  let authStatus = 200;
  const authTransport: typeof fetch = async (input, init) => {
    // Mocking fetch alone misses unsupported options such as redirect: error.
    const request = new Request(input, init);
    assert.equal(request.url, `${origin}/auth/v1/user`);
    assert.equal(request.redirect, 'manual');
    assert.equal(request.headers.get('apikey'), 'synthetic-publishable-key');
    assert.equal(request.headers.get('authorization'), `Bearer ${token}`);
    authCalls++;
    return authStatus === 200
      ? Response.json({
          id: claims.sub,
          identities: [{ provider: 'google' }],
        })
      : new Response(null, {
          status: authStatus,
          headers: { location: 'https://untrusted.invalid/auth' },
        });
  };
  const verify = createManagedAuthVerifier(
    origin,
    'synthetic-publishable-key',
    authTransport,
  );
  assert.deepEqual(await verify(token), {
    authUserId: claims.sub,
    sessionId: claims.session_id,
    expiresAt: new Date(claims.exp * 1000).toISOString(),
  });

  const tick = () => new Promise((resolve) => setTimeout(resolve, 1));
  const database = drizzle.mock();
  database.transaction = async (work) => {
    await tick();
    return work({} as Parameters<typeof work>[0]);
  };
  let deferred: Promise<unknown> | undefined;
  await ownerTransactions(database).transaction(async () => {
    await assert.rejects(verify(token), { code: 'UNAVAILABLE' });
    await tick();
    await assert.rejects(verify(token), { code: 'UNAVAILABLE' });
    deferred = tick().then(() => verify(token));
  });
  assert.equal(authCalls, 1, 'Owner transaction refused provider I/O');
  await verify(token);
  await deferred;
  assert.equal(authCalls, 3, 'Provider I/O resumed after the transaction');

  authStatus = 307;
  await assert.rejects(verify(token), { code: 'UNAVAILABLE', status: 503 });
  assert.equal(authCalls, 4);

  const config = serverDiagnosticConfiguration(
    true,
    `https://${'c'.repeat(32)}@o1.ingest.us.sentry.io/1`,
    'b'.repeat(40),
    'staging',
  )!;
  const diagnostic = {
    statusCode: 503,
    requestId: 'bb3c9b2b-6503-4086-9752-cb34c49a29f8',
  };
  let reports = 0;
  let reportStatus = 200;
  let now = Date.now();
  const send: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    assert.equal(request.url, config.endpoint);
    assert.equal(request.redirect, 'manual');
    assert.equal(request.method, 'POST');
    const lines = (await request.text()).split('\n');
    assert.equal(JSON.parse(lines[0]!).dsn, config.dsn);
    assert.deepEqual(JSON.parse(lines[2]!).extra, {
      requestId: diagnostic.requestId,
    });
    reports++;
    return new Response(null, {
      status: reportStatus,
      headers: { location: 'https://untrusted.invalid/collect' },
    });
  };
  const report = createServerErrorReporter(config, { send, now: () => now });
  await report(diagnostic);
  assert.equal(reports, 1, 'Successful error delivery');
  reportStatus = 302;
  await report(diagnostic);
  now += 59_999;
  await report(diagnostic);
  assert.equal(reports, 2, 'Redirect rejected with backoff and no retry');
}
