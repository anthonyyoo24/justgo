import { apiRequest } from '../request.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/build-app.js';
import { IdentityService } from '../../src/identity/service.js';
import { verifySvix } from '../../src/billing/webhook.js';
import { superwallEvent, svixHeaders, testWebhookSecret } from './svix.js';

// Database cases (saving once, duplicates, out-of-order events, refunds and
// Apple outages) are in webhook.integration.test.ts under `pnpm run test:db`.

const secret = testWebhookSecret();
const body = superwallEvent('renewal', '2000000000000001');
const now = Date.now();
const headers = (
  signed: Record<string, string>,
): { id: string; timestamp: string; signature: string } => ({
  id: signed['svix-id'] ?? '',
  timestamp: signed['svix-timestamp'] ?? '',
  signature: signed['svix-signature'] ?? '',
});
const refused = expect.objectContaining({
  code: 'INVALID_REQUEST',
  status: 400,
});

describe('Svix signature check', () => {
  it('accepts a signed delivery and answers its message ID', () => {
    const signed = svixHeaders(secret, body, { id: 'msg_1' });
    expect(verifySvix(secret, headers(signed), body, now)).toBe('msg_1');
  });

  it('accepts any one valid v1 signature among several, as during a secret rotation', () => {
    const signed = svixHeaders(secret, body);
    const other = svixHeaders(testWebhookSecret(), body, {
      id: signed['svix-id'],
      timestamp: Number(signed['svix-timestamp']),
    });
    expect(
      verifySvix(
        secret,
        {
          ...headers(signed),
          signature: `v1a,abc ${other['svix-signature']} ${signed['svix-signature']}`,
        },
        body,
        now,
      ),
    ).toBe(signed['svix-id']);
  });

  it.each([
    ['another secret', () => svixHeaders(testWebhookSecret(), body), body],
    ['a changed body', () => svixHeaders(secret, body), `${body} `],
    [
      'a signature for another message ID',
      () => ({ ...svixHeaders(secret, body), 'svix-id': 'msg_other' }),
      body,
    ],
  ])('refuses a delivery signed with %s', (_name, sign, delivered) => {
    expect(() => verifySvix(secret, headers(sign()), delivered, now)).toThrow(
      refused,
    );
  });

  it.each([
    ['more than five minutes old', -301],
    ['more than five minutes ahead', 301],
  ])('refuses a timestamp %s', (_name, offset) => {
    const signed = svixHeaders(secret, body, {
      timestamp: Math.floor(now / 1000) + offset,
    });
    expect(() => verifySvix(secret, headers(signed), body, now)).toThrow(
      refused,
    );
    const edge = svixHeaders(secret, body, {
      timestamp: Math.floor(now / 1000) + Math.sign(offset) * 299,
    });
    expect(verifySvix(secret, headers(edge), body, now)).toBe(edge['svix-id']);
  });

  it('refuses missing or malformed headers and a signature of the wrong length', () => {
    const signed = headers(svixHeaders(secret, body));
    for (const broken of [
      { ...signed, id: '' },
      { ...signed, id: 'msg 1' },
      { ...signed, id: 'm'.repeat(256) },
      { ...signed, timestamp: '' },
      { ...signed, timestamp: '1e9' },
      { ...signed, signature: '' },
      { ...signed, signature: signed.signature.replace('v1,', 'v2,') },
      { ...signed, signature: 'v1,' },
      { ...signed, signature: `v1,${Buffer.alloc(31).toString('base64')}` },
      { ...signed, signature: `v1,${'A'.repeat(4100)}` },
    ])
      expect(() => verifySvix(secret, broken, body, now)).toThrow(refused);
  });
});

describe('Superwall event route', () => {
  function app() {
    const database = drizzle.mock();
    const transaction = vi.spyOn(database, 'transaction');
    const identity = new IdentityService(database, { rateKey: 'webhook' });
    vi.spyOn(identity, 'rateLimit').mockResolvedValue();
    const subscriptions = vi.fn(() => Promise.reject(new Error('not called')));
    return {
      transaction,
      subscriptions,
      app: buildApp({
        logger: false,
        checkDatabase: async () => {},
        identity,
        billing: () => Promise.reject(new Error('not called')),
        billingEvents: {
          subscriptions,
          webhookSecret: secret,
          repairSecret: 'r'.repeat(32),
        },
      }),
    };
  }
  const deliver = (
    target: ReturnType<typeof app>['app'],
    signed: Record<string, string>,
    payload = body,
  ) =>
    apiRequest(target, {
      method: 'POST',
      url: '/v1/billing/superwall-events',
      headers: { 'content-type': 'application/json', ...signed },
      payload,
    });

  it('refuses an unsigned, stale or wrongly signed event before saving anything or asking Apple', async () => {
    const stale = Math.floor(Date.now() / 1000) - 600;
    for (const signed of [
      {},
      svixHeaders(testWebhookSecret(), body),
      svixHeaders(secret, body, { timestamp: stale }),
    ]) {
      const target = app();
      const response = await deliver(target.app, signed);
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'INVALID_REQUEST' });
      expect(target.transaction).not.toHaveBeenCalled();
      expect(target.subscriptions).not.toHaveBeenCalled();
    }
  });

  it('checks the signature before parsing, so a signed body that is not JSON is the only one that reaches the parser', async () => {
    const target = app();
    const unsigned = await deliver(target.app, {}, '{not json');
    expect(unsigned.statusCode).toBe(400);
    const signed = await deliver(
      target.app,
      svixHeaders(secret, '{not json'),
      '{not json',
    );
    expect(signed.statusCode).toBe(400);
    expect(target.transaction).not.toHaveBeenCalled();
  });

  it('answers 503 when the event cannot be saved, so Superwall retries', async () => {
    const target = app();
    target.transaction.mockRejectedValue(new Error('database offline'));
    const response = await deliver(target.app, svixHeaders(secret, body));
    expect(response.statusCode).toBe(503);
    expect(target.subscriptions).not.toHaveBeenCalled();
  });

  it('never echoes the secret or the payload in a refusal', async () => {
    const target = app();
    const response = await deliver(
      target.app,
      svixHeaders(testWebhookSecret(), body),
    );
    expect(response.body).not.toContain(secret.slice(6));
    expect(response.body).not.toContain('2000000000000001');
  });
});
