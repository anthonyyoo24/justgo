import { randomBytes } from 'node:crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactNativeOptions } from '@sentry/react-native';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';
import { focusManager } from '@tanstack/react-query';
import { strFromU8, unzipSync } from 'fflate';
import { useEffect } from 'react';
import { z } from 'zod';
import type {
  CompletionRestoreRequest,
  JournalSyncRequest,
  SessionResponse,
} from '@justgo/contracts';
import { card, input, uuid } from '../../../test-support/journal';
import { globalJournalBackend } from '../../../test-support/setup-global-local-journal';
import { collectExport } from '../../features/settings/export/data-export';
import { createAuthStorage } from '../../platform/auth/auth-storage';
import { diagnosticConfiguration } from '../diagnostics/configuration';
import { createErrorReporter } from '../diagnostics/reporter';
import { createIdentityApi } from '../identity/api';
import { createManagedIdentityController } from '../identity/auth/create-managed-identity';
import { createManagedAuth } from '../identity/auth/managed-auth';
import { ManagedIdentityController } from '../identity/auth/managed-controller';
import { createManagedIdentityStorage } from '../identity/auth/managed-state';
import { nativeProviderToken } from '../identity/auth/provider-token';
import { createMemoryVault, type CredentialVault } from '../identity/storage';
import { AppProvider, useRuntime } from './AppProvider';

jest.mock('expo-crypto', () => {
  let sequence = 10;
  return {
    randomUUID: () =>
      `00000000-0000-4000-8000-${String(sequence++).padStart(12, '0')}`,
    getRandomValues: (array: Uint8Array) => array.fill(0xbb),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
    digestStringAsync: (_algorithm: string, value: string) =>
      Promise.resolve(
        (require('node:crypto') as typeof import('node:crypto'))
          .createHash('sha256')
          .update(value)
          .digest('hex'),
      ),
  };
});
// The real Supabase client runs on this in-memory Keychain, the one place
// provider tokens may rest.
jest.mock('expo-secure-store', () => {
  const keychain = new Map<string, string>();
  return {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'unlocked-this-device',
    getItemAsync: async (key: string) => keychain.get(key) ?? null,
    setItemAsync: async (key: string, value: string) => {
      keychain.set(key, value);
    },
    deleteItemAsync: async (key: string) => {
      keychain.delete(key);
    },
    keychain,
  };
});
jest.mock('../identity/auth/provider-token', () => ({
  nativeProviderToken: jest.fn(),
}));
jest.mock('../../platform/connectivity/connectivity', () => ({
  listenToConnectivity: () => () => {},
}));
jest.mock('../identity/auth/create-managed-identity', () => ({
  createManagedIdentityController: jest.fn(),
}));

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const hex = () => randomBytes(32).toString('hex');
// Supabase access tokens are base64url JWTs; give the canary that shape.
const jwt = () =>
  [16, 48, 32].map((size) => randomBytes(size).toString('base64url')).join('.');
const canaries = {
  providerToken: jwt(),
  renewedProviderToken: jwt(),
  refreshToken: randomBytes(24).toString('base64url'),
  renewedRefreshToken: randomBytes(24).toString('base64url'),
  appleIdToken: jwt(),
  appleNonce: hex(),
  legacySessionToken: hex(),
  legacyRecoverySecret: hex(),
  legacyRegistrationSecret: hex(),
};
const userId = id(1);
const authUserId = id(40);
const session: SessionResponse = {
  userId,
  deviceId: id(2),
  sessionId: id(3),
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
};
const reflection = 'Synthetic canary reflection';
const supabaseUrl = 'https://synthetic.supabase.co';
const sentryDsn = `https://${'d'.repeat(32)}@o123.ingest.us.sentry.io/4512279181459456`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
const keychain = (SecureStore as unknown as { keychain: Map<string, string> })
  .keychain;

let runtime: ReturnType<typeof useRuntime>;
let controller: ManagedIdentityController;
let vault: CredentialVault;
let authorizations: string[];
let sentryBodies: string[];
let requests: string[];
let storageWrites: jest.SpyInstance[];
const originalEnv = { ...process.env };

function Probe() {
  const current = useRuntime();
  useEffect(() => {
    runtime = current;
  }, [current]);
  return null;
}

// A leak may be encoded or cut short. Match any 16-character run of a secret,
// raw or base64 or base64url at any byte offset, ignoring case. Shorter
// fragments pass.
const span = 16;
const runs = (text: string) =>
  Array.from({ length: Math.max(0, text.length - span + 1) }, (_, index) =>
    text.slice(index, index + span),
  );
const forms = (secret: string) =>
  [0, 1, 2]
    .map((shift) =>
      Buffer.from('\0'.repeat(shift) + secret)
        .toString('base64')
        .slice(shift ? 4 : 0, -4),
    )
    .flatMap((base64) => [
      base64,
      base64.replace(/\+/g, '-').replace(/\//g, '_'),
    ])
    .concat(secret)
    .map((form) => form.toLowerCase());
const leaks = (sinks: Record<string, string>) =>
  Object.entries(sinks).flatMap(([sink, contents]) => {
    const present = new Set(runs(contents.toLowerCase()));
    return Object.entries(canaries)
      .filter(([, secret]) =>
        forms(secret).some((form) =>
          runs(form).some((run) => present.has(run)),
        ),
      )
      .map(([name]) => `${name} in ${sink}`);
  });

// Every value ever written, so a write that a later clear removes still counts.
const asyncStorageWrites = () =>
  JSON.stringify(storageWrites.map((spy) => spy.mock.calls));

const journalRows = (owner: string) =>
  globalJournalBackend()
    .transaction(owner, async (transaction) => [
      await transaction.list(),
      await transaction.listConflicts(),
    ])
    .then((rows) => JSON.stringify(rows));

beforeEach(async () => {
  await AsyncStorage.clear();
  keychain.clear();
  authorizations = [];
  sentryBodies = [];
  requests = [];
  // The storage mock's methods are already mocks that keep calls across tests.
  storageWrites = (
    ['setItem', 'multiSet', 'mergeItem', 'multiMerge'] as const
  ).map((method) => jest.spyOn(AsyncStorage, method).mockClear());
  jest.useFakeTimers({ doNotFake: ['performance', 'queueMicrotask'] });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
  process.env.EXPO_PUBLIC_SUPABASE_URL = supabaseUrl;
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
  jest.mocked(nativeProviderToken).mockResolvedValue({
    token: canaries.appleIdToken,
    nonce: canaries.appleNonce,
  });
  vault = createMemoryVault();
  const secure = new Map<string, string>();
  controller = new ManagedIdentityController({
    auth: createManagedAuth(),
    storage: createManagedIdentityStorage(),
    legacyVault: vault,
    api: createIdentityApi('http://localhost:3000', (...args) =>
      fetch(...args),
    ),
    secureStorage: {
      getItem: async (key) => secure.get(key) ?? null,
      setItem: async (key, value) => {
        secure.set(key, value);
      },
      removeItem: async (key) => {
        secure.delete(key);
      },
    },
  });
  jest.mocked(createManagedIdentityController).mockReturnValue(controller);
  const user = {
    id: authUserId,
    aud: 'authenticated',
    role: 'authenticated',
    app_metadata: { provider: 'apple' },
    user_metadata: {},
    created_at: new Date().toISOString(),
    identities: [
      {
        provider: 'apple',
        identity_id: id(41),
        id: id(41),
        user_id: authUserId,
        last_sign_in_at: new Date().toISOString(),
      },
    ],
  };
  const tokens = (access_token: string, refresh_token: string) =>
    json({
      access_token,
      refresh_token,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user,
    });
  const attempts: CompletionRestoreRequest['attempts'] = [];
  const versions: JournalSyncRequest['versions'] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (target, init) => {
    const url = new URL(String(target));
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${url.origin}${url.pathname}`);
    const authorization = new Headers(init?.headers).get('authorization');
    if (authorization) authorizations.push(authorization);
    if (url.hostname.endsWith('sentry.io')) {
      sentryBodies.push(String(init?.body));
      return new Response(null, { status: 200 });
    }
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : null;
    switch (`${method} ${url.origin}${url.pathname}`) {
      case `POST ${supabaseUrl}/auth/v1/token`:
        return url.searchParams.get('grant_type') === 'refresh_token'
          ? tokens(canaries.renewedProviderToken, canaries.renewedRefreshToken)
          : tokens(canaries.providerToken, canaries.refreshToken);
      case `GET ${supabaseUrl}/auth/v1/user`:
        return json(user);
      case `POST ${supabaseUrl}/auth/v1/logout`:
        return new Response(null, { status: 204 });
      case 'POST http://localhost:3000/v1/auth/session':
        return json({ ...session, authUserId, dataEpoch: 0 });
      case 'POST http://localhost:3000/v1/auth/logout':
        return json({ ok: true });
      case 'GET http://localhost:3000/v1/access':
      case 'GET http://localhost:3000/v1/guest/access':
        return json({
          status: 'verified',
          checkedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
      case 'GET http://localhost:3000/v1/completion-restores':
        return json({ dataEpoch: 0, attempts, nextCursor: null });
      case 'POST http://localhost:3000/v1/completion-restores': {
        const request = body as CompletionRestoreRequest;
        attempts.push(...request.attempts);
        return json({
          dataEpoch: 0,
          attempts: request.attempts,
          added: request.attempts.length,
          identical: 0,
        });
      }
      case 'GET http://localhost:3000/v1/journal-sync':
        return json({ dataEpoch: 0, versions, nextCursor: null });
      case 'POST http://localhost:3000/v1/journal-sync': {
        const request = body as JournalSyncRequest;
        versions.push(...request.versions);
        return json({
          dataEpoch: 0,
          versions: request.versions,
          saved: request.versions.length,
          identical: 0,
        });
      }
      case 'GET http://localhost:3000/v1/sessions/current':
        return json(session);
      case 'GET http://localhost:3000/v1/devices':
        return json({ devices: [] });
      case 'GET http://localhost:3000/v1/credentials':
        return json({ credentials: [] });
      // The first provider token expires here, so the client renews it once.
      case 'GET http://localhost:3000/v1/canary-renewal':
        return authorization === `Bearer ${canaries.providerToken}`
          ? json({ code: 'SESSION_EXPIRED', requestId: 'fixture' }, 401)
          : json({ ok: true });
      case 'GET http://localhost:3000/v1/canary-failure':
        return json({ code: 'INTERNAL', requestId: 'fixture' }, 500);
      default:
        throw new Error(`Unexpected fixture request: ${method} ${url.href}`);
    }
  });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation(() => ({ remove: () => {} }));
});
afterEach(async () => {
  await act(async () => await cleanup());
  await runtime?.client.queries.cancelQueries();
  runtime?.client.queries.clear();
  runtime?.activity.dispose();
  controller?.dispose();
  focusManager.setFocused(undefined);
  await act(async () => jest.runOnlyPendingTimersAsync());
  jest.restoreAllMocks();
  jest.useRealTimers();
  process.env = { ...originalEnv };
});

async function mount() {
  await render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
  await waitFor(() => expect(controller.getSnapshot().initialized).toBe(true));
}

async function signIn() {
  await act(async () => controller.signIn('apple'));
  await waitFor(() =>
    expect(runtime.activity.getRepository()?.accountId).toBe(userId),
  );
  const repository = runtime.activity.getRepository()!;
  await waitFor(() =>
    expect(repository.store.getState().dataMode).toBe('cloud'),
  );
  return repository;
}

async function reportThroughSentryBoundary(error: Error) {
  let options!: ReactNativeOptions;
  const reporter = createErrorReporter({
    init: (value) => {
      options = value;
    },
    // Hand the boundary everything an SDK could attach, the bearer included.
    captureException: (captured) => {
      const bearer = `Bearer ${canaries.renewedProviderToken}`;
      const event = {
        event_id: 'e'.repeat(32),
        level: 'error',
        message: `${captured.message} ${bearer}`,
        request: { headers: { authorization: bearer } },
        user: { id: canaries.renewedProviderToken },
        tags: { token: canaries.renewedProviderToken },
        breadcrumbs: [{ category: 'fetch', data: { authorization: bearer } }],
        extra: { error: captured, canaries },
        exception: {
          values: [
            {
              type: captured.name,
              value: captured.message,
              stacktrace: {
                frames: [
                  {
                    filename: `http://localhost:8081/index.bundle?token=${canaries.renewedProviderToken}`,
                    lineno: 1,
                    colno: 1,
                  },
                ],
              },
            },
          ],
        },
      } as unknown as Parameters<
        NonNullable<ReactNativeOptions['beforeSend']>
      >[0];
      const transport = options.transport!({} as never);
      const sent = options.beforeSend!(event, { originalException: captured });
      void transport.send([
        {},
        [[{ type: 'event' }, sent]],
      ] as unknown as Parameters<typeof transport.send>[0]);
    },
  });
  reporter.initialize(diagnosticConfiguration('true', sentryDsn, 'staging'), {
    version: '0.1.0',
    os: 'ios',
    osVersion: '26.0',
    environment: 'staging',
  });
  expect(reporter.capture(error)).toBe(true);
  await act(async () => jest.advanceTimersByTimeAsync(0));
}

it('keeps tokens and credential secrets out of AsyncStorage, the journal, exports and diagnostics through sign-in, renewal and sign-out', async () => {
  await vault.write({
    deviceId: session.deviceId,
    selectedId: id(4),
    session: { token: canaries.legacySessionToken, info: session },
    pending: null,
    savedKey: {
      id: id(5),
      secret: canaries.legacyRecoverySecret,
      registered: true,
    },
    registration: { id: id(6), secret: canaries.legacyRegistrationSecret },
  });
  await mount();
  const repository = await signIn();
  await act(async () => {
    await repository.complete(input(1), card);
    await repository.submitReflection(uuid(1), uuid(2), { text: reflection });
    await repository.synchronize();
  });
  await act(async () =>
    runtime.client.request('/v1/canary-renewal', z.unknown()),
  );
  const keychainSession = await createAuthStorage().getItem('justgo.auth.v1');
  const archive = await act(async () =>
    collectExport({
      client: runtime.client,
      repository,
      ownerKind: 'account',
      reduceMotion: false,
      haptics: false,
      signal: new AbortController().signal,
    }),
  );
  const failure = await runtime.client
    .request('/v1/canary-failure', z.unknown())
    .then(
      () => new Error('The fixture request should fail'),
      (error: unknown) => error as Error,
    );
  await reportThroughSentryBoundary(failure);
  await act(async () => {
    expect(await controller.signOut()).toBe(true);
  });

  const stored = asyncStorageWrites();
  const journal = await journalRows(userId);
  const exported =
    Object.entries(unzipSync(archive.bytes))
      .map(([name, bytes]) => `${name}\n${strFromU8(bytes)}`)
      .join('\n') + strFromU8(archive.bytes, true);
  expect(
    leaks({
      AsyncStorage: stored,
      journal,
      export: exported,
      diagnostics: sentryBodies.join('\n'),
    }),
  ).toEqual([]);
  // Each sink and path ran with the secrets in play, so a skipped step cannot
  // pass as a clean one.
  expect(authorizations).toEqual(
    expect.arrayContaining([
      `Bearer ${canaries.legacySessionToken}`,
      `Bearer ${canaries.providerToken}`,
      `Bearer ${canaries.renewedProviderToken}`,
    ]),
  );
  expect(keychainSession).toContain(canaries.renewedRefreshToken);
  expect(keychain.size).toBe(0);
  expect(stored).toContain('justgo.identity.managed.v1');
  expect(stored).toContain(uuid(1));
  expect(journal).toContain(reflection);
  expect(exported).toContain(reflection);
  expect(requests).toEqual(
    expect.arrayContaining([
      'POST http://localhost:3000/v1/completion-restores',
      'POST http://localhost:3000/v1/journal-sync',
      `POST ${supabaseUrl}/auth/v1/token`,
      'POST http://localhost:3000/v1/auth/logout',
      `POST ${supabaseUrl}/auth/v1/logout`,
    ]),
  );
  expect(sentryBodies).toHaveLength(1);
  expect(controller.getSnapshot().mode).toBe('signed-out');
});

it('keeps the provider token out of AsyncStorage and the journal while a guest journal is adopted', async () => {
  await mount();
  await act(async () => controller.continueAsGuest());
  await waitFor(() =>
    expect(runtime.activity.getRepository()?.accountId).toBeTruthy(),
  );
  const guest = runtime.activity.getRepository()!;
  const guestId = guest.accountId;
  await act(async () => {
    await guest.complete(input(1), card);
    await guest.submitReflection(uuid(1), uuid(2), { text: reflection });
  });
  await signIn();

  const stored = asyncStorageWrites();
  const journal = await journalRows(userId);
  expect(leaks({ AsyncStorage: stored, journal })).toEqual([]);
  // The adoption copied the guest rows to the account with the provider token.
  expect(stored).toContain(`justgo:v1:${guestId}:`);
  expect(stored).toMatch(/"status\\":\\"consumed\\"/);
  expect(journal).toContain(reflection);
  expect(authorizations).toContain(`Bearer ${canaries.providerToken}`);
  expect(requests).toEqual(
    expect.arrayContaining([
      'POST http://localhost:3000/v1/completion-restores',
      'POST http://localhost:3000/v1/journal-sync',
    ]),
  );
});
