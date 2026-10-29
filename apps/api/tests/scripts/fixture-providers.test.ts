import { apiRequest } from '../request.js';
import { Hono } from 'hono';
import type { ApiEnvironment } from '../../src/http/request.js';
import { buildApp } from '../../src/build-app.js';
import { describe, it, expect } from 'vitest';
import {
  FixtureProviders,
  fixtureProviderRoutes,
} from '../../scripts/fixture-providers.js';
describe('guarded provider-session fixture boundary', () => {
  it('allocates subjects itself, rejects unowned handles and retains returning principal identity', async () => {
    const providers = new FixtureProviders(),
      first = providers.create({ provider: 'apple' });
    expect(first.subjectHandle).toMatch(/^[a-f0-9]{32}$/);
    expect(() =>
      providers.create({ provider: 'apple', subjectHandle: 'f'.repeat(32) }),
    ).toThrow('INVALID_REQUEST');
    expect(() =>
      providers.create({
        provider: 'apple',
        authUserId: first.session.authUserId,
      }),
    ).toThrow('INVALID_REQUEST');
    const returning = providers.create({
      provider: 'apple',
      subjectHandle: first.subjectHandle,
    });
    expect(returning.session.authUserId).toBe(first.session.authUserId);
    expect(
      (await providers.verify(returning.session.accessToken)).sessionId,
    ).not.toBe((await providers.verify(first.session.accessToken)).sessionId);
    expect(
      providers.create({ provider: 'google' }).session.authUserId,
    ).not.toBe(first.session.authUserId);
  });
  it('links providers without replacing a session or claiming another account', async () => {
    const providers = new FixtureProviders(),
      first = providers.create({ provider: 'apple' });
    const linked = providers.link({
      accessToken: first.session.accessToken,
      provider: 'google',
    });
    expect(linked.session.accessToken).toBe(first.session.accessToken);
    expect(linked.session.authUserId).toBe(first.session.authUserId);
    expect(linked.session.linkedProviders).toEqual(['apple', 'google']);
    expect(() =>
      providers.link({ accessToken: 'unowned', provider: 'google' }),
    ).toThrow('UNAUTHORIZED');
    providers.signOut({ accessToken: first.session.accessToken });
    expect(() =>
      providers.link({
        accessToken: first.session.accessToken,
        provider: 'google',
      }),
    ).toThrow('UNAUTHORIZED');
  });
  it('checks live session revocation and hard deletion without resurrecting an old Auth subject', async () => {
    const providers = new FixtureProviders(),
      first = providers.create({ provider: 'apple' }),
      returning = providers.create({
        provider: 'google',
        subjectHandle: first.subjectHandle,
      });
    const verified = await providers.verify(first.session.accessToken);
    // The injected reader never uses its transaction; real API integration exercises the owner transaction separately.
    expect(await providers.live(undefined as never, verified)).toBe(true);
    providers.signOut({ accessToken: first.session.accessToken });
    expect(await providers.live(undefined as never, verified)).toBe(false);
    await providers.erase(first.session.authUserId);
    await expect(
      providers.verify(returning.session.accessToken),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await providers.erase(first.session.authUserId);
    const fresh = providers.create({
      provider: 'apple',
      subjectHandle: first.subjectHandle,
    });
    expect(fresh.session.authUserId).not.toBe(first.session.authUserId);
    expect(fresh.subjectHandle).toBe(first.subjectHandle);
  });
  it('unlinks only a registered session identity and preserves the final method', async () => {
    const providers = new FixtureProviders();
    const first = providers.create({ provider: 'apple' });
    expect(() =>
      providers.unlink({
        accessToken: first.session.accessToken,
        provider: 'apple',
      }),
    ).toThrow('INVALID_REQUEST');
    providers.link({
      accessToken: first.session.accessToken,
      provider: 'google',
    });
    const unlinked = providers.unlink({
      accessToken: first.session.accessToken,
      provider: 'apple',
    });
    expect(unlinked).toEqual({
      ...first,
      session: { ...first.session, linkedProviders: ['google'] },
    });
    expect(
      providers.unlink({
        accessToken: first.session.accessToken,
        provider: 'apple',
      }),
    ).toEqual(unlinked);
    expect(() =>
      providers.unlink({ accessToken: 'unowned', provider: 'google' }),
    ).toThrow('UNAUTHORIZED');
    providers.signOut({ accessToken: first.session.accessToken });
    expect(() =>
      providers.unlink({
        accessToken: first.session.accessToken,
        provider: 'google',
      }),
    ).toThrow('UNAUTHORIZED');
    const second = providers.create({ provider: 'google' });
    await providers.erase(second.session.authUserId);
    expect(() =>
      providers.unlink({
        accessToken: second.session.accessToken,
        provider: 'google',
      }),
    ).toThrow('UNAUTHORIZED');
  });
  it('returns only safe typed failures from disposable HTTP routes', async () => {
    const app = buildApp({ logger: false, checkDatabase: async () => {} });
    const router = new Hono<ApiEnvironment>();
    fixtureProviderRoutes(router, new FixtureProviders());
    app.route('/__fixtures', router);

    const invalid = await apiRequest(app, {
      method: 'POST',
      url: '/__fixtures/provider-sessions',
      payload: {
        provider: 'apple',
        subjectHandle: 'untrusted-private-value',
      },
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.body).not.toContain('untrusted-private-value');
    const response = await apiRequest(app, {
      method: 'POST',
      url: '/__fixtures/provider-sessions',
      payload: { provider: 'apple' },
    });
    expect(response.statusCode).toBe(200);
    const accessToken =
      response.json<ReturnType<FixtureProviders['create']>>().session
        .accessToken;
    const last = await apiRequest(app, {
      method: 'POST',
      url: '/__fixtures/provider-unlinks',
      payload: { accessToken, provider: 'apple' },
    });
    expect(last.statusCode).toBe(409);
    await apiRequest(app, {
      method: 'POST',
      url: '/__fixtures/provider-links',
      payload: { accessToken, provider: 'google' },
    });
    const unlinked = await apiRequest(app, {
      method: 'POST',
      url: '/__fixtures/provider-unlinks',
      payload: { accessToken, provider: 'apple' },
    });
    expect(unlinked.statusCode).toBe(200);
    expect(
      unlinked.json<ReturnType<FixtureProviders['create']>>().session
        .linkedProviders,
    ).toEqual(['google']);
    expect(
      (
        await apiRequest(app, {
          method: 'POST',
          url: '/__fixtures/provider-sign-outs',
          payload: {
            accessToken:
              response.json<ReturnType<FixtureProviders['create']>>().session
                .accessToken,
          },
        })
      ).json(),
    ).toEqual({ ok: true });
  });
});
