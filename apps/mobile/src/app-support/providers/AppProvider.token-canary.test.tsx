import { randomBytes } from 'node:crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReactNativeOptions } from '@sentry/react-native';
import { act, cleanup, render, waitFor } from '@testing-library/react-native';
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
import { diagnosticConfiguration } from '../diagnostics/configuration';
import { createErrorReporter } from '../diagnostics/reporter';
import { createIdentityApi } from '../identity/api';
import { createManagedIdentityController } from '../identity/auth/create-managed-identity';
import { ManagedIdentityController } from '../identity/auth/managed-controller';
import { createManagedIdentityStorage } from '../identity/auth/managed-state';
import type { ManagedAuth, ProviderSession } from '../identity/auth/types';
import { createMemoryVault } from '../identity/storage';
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
jest.mock('../../platform/connectivity/connectivity', () => ({
  listenToConnectivity: () => () => {},
}));
jest.mock('../identity/auth/create-managed-identity', () => ({
  createManagedIdentityController: jest.fn(),
}));

const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const canary = () => randomBytes(32).toString('hex');
const canaries = {
  providerToken: canary(),
  legacySessionToken: canary(),
  legacyRecoverySecret: canary(),
  legacyRegistrationSecret: canary(),
};
const userId = id(1);
const session: SessionResponse = {
  userId,
  deviceId: id(2),
  sessionId: id(3),
  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
};
const reflection = 'Synthetic canary reflection';
const sentryDsn = `https://${'d'.repeat(32)}@o123.ingest.us.sentry.io/4512279181459456`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });

let runtime: ReturnType<typeof useRuntime>;
let controller: ManagedIdentityController;
let authorizations: string[];
let sentryBodies: string[];
let requests: string[];
const originalUrl = process.env.EXPO_PUBLIC_API_URL;

function Probe() {
  const current = useRuntime();
  useEffect(() => {
    runtime = current;
  }, [current]);
  return null;
}

const leaks = (sink: string, contents: string) =>
  Object.entries(canaries)
    .filter(([, secret]) => contents.includes(secret))
    .map(([name]) => `${name} in ${sink}`);

beforeEach(async () => {
  await AsyncStorage.clear();
  authorizations = [];
  sentryBodies = [];
  requests = [];
  jest.useFakeTimers({ doNotFake: ['performance', 'queueMicrotask'] });
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3000';
  const vault = createMemoryVault();
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
  const provider: ProviderSession = {
    authUserId: id(40),
    accessToken: canaries.providerToken,
    expiresAt: session.expiresAt,
  };
  const auth: ManagedAuth = {
    initialize: jest.fn(async () => null),
    refresh: jest.fn(async () => provider),
    signIn: jest.fn(async () => provider),
    linkIdentity: jest.fn(async () => provider),
    unlinkIdentity: jest.fn(async () => provider),
    signOut: jest.fn(async () => {}),
    setActive: jest.fn(),
    subscribe: jest.fn(() => () => {}),
    dispose: jest.fn(),
  };
  const secure = new Map<string, string>();
  controller = new ManagedIdentityController({
    auth,
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
  const attempts: CompletionRestoreRequest['attempts'] = [];
  const versions: JournalSyncRequest['versions'] = [];
  jest.spyOn(globalThis, 'fetch').mockImplementation(async (target, init) => {
    const url = new URL(String(target));
    const method = init?.method ?? 'GET';
    requests.push(`${method} ${url.pathname}`);
    const authorization = new Headers(init?.headers).get('authorization');
    if (authorization) authorizations.push(authorization);
    if (url.hostname.endsWith('sentry.io')) {
      sentryBodies.push(String(init?.body));
      return new Response(null, { status: 200 });
    }
    const body = init?.body ? (JSON.parse(String(init.body)) as unknown) : null;
    switch (`${method} ${url.pathname}`) {
      case 'POST /v1/auth/session':
        return json({
          ...session,
          authUserId: provider.authUserId,
          dataEpoch: 0,
        });
      case 'GET /v1/access':
        return json({
          status: 'verified',
          checkedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600000).toISOString(),
        });
      case 'GET /v1/completion-restores':
        return json({ dataEpoch: 0, attempts, nextCursor: null });
      case 'POST /v1/completion-restores': {
        const request = body as CompletionRestoreRequest;
        attempts.push(...request.attempts);
        return json({
          dataEpoch: 0,
          attempts: request.attempts,
          added: request.attempts.length,
          identical: 0,
        });
      }
      case 'GET /v1/journal-sync':
        return json({ dataEpoch: 0, versions, nextCursor: null });
      case 'POST /v1/journal-sync': {
        const request = body as JournalSyncRequest;
        versions.push(...request.versions);
        return json({
          dataEpoch: 0,
          versions: request.versions,
          saved: request.versions.length,
          identical: 0,
        });
      }
      case 'GET /v1/sessions/current':
        return json(session);
      case 'GET /v1/devices':
        return json({ devices: [] });
      case 'GET /v1/credentials':
        return json({ credentials: [] });
      case 'GET /v1/canary-failure':
        return json({ code: 'INTERNAL', requestId: 'fixture' }, 500);
      default:
        throw new Error(
          `Unexpected fixture request: ${method} ${url.pathname}`,
        );
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
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = originalUrl;
});

async function reportThroughSentryBoundary(error: Error) {
  let options!: ReactNativeOptions;
  const reporter = createErrorReporter({
    init: (value) => {
      options = value;
    },
    // Hand the boundary everything an SDK could attach, the bearer included.
    captureException: (captured) => {
      const event = {
        event_id: 'e'.repeat(32),
        level: 'error',
        message: `${captured.message} Bearer ${canaries.providerToken}`,
        request: {
          headers: { authorization: `Bearer ${canaries.providerToken}` },
        },
        extra: { error: captured, canaries },
        exception: {
          values: [
            {
              type: captured.name,
              value: captured.message,
              stacktrace: {
                frames: [
                  {
                    filename: `http://localhost:8081/index.bundle?token=${canaries.providerToken}`,
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

it('keeps session tokens and credential secrets out of AsyncStorage, the journal, exports and diagnostics', async () => {
  await render(
    <AppProvider>
      <Probe />
    </AppProvider>,
  );
  await waitFor(() => expect(controller.getSnapshot().initialized).toBe(true));
  await act(async () => controller.signIn('apple'));
  await waitFor(() =>
    expect(runtime.activity.getRepository()?.accountId).toBe(userId),
  );
  const repository = runtime.activity.getRepository()!;
  await waitFor(() =>
    expect(repository.store.getState().dataMode).toBe('cloud'),
  );
  await act(async () => {
    await repository.complete(input(1), card);
    await repository.submitReflection(uuid(1), uuid(2), { text: reflection });
    await repository.synchronize();
  });
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

  const stored = JSON.stringify(
    await AsyncStorage.multiGet(await AsyncStorage.getAllKeys()),
  );
  const journal = JSON.stringify(
    await globalJournalBackend().transaction(userId, async (transaction) => [
      await transaction.list(),
      await transaction.listConflicts(),
    ]),
  );
  const exported =
    Object.entries(unzipSync(archive.bytes))
      .map(([name, bytes]) => `${name}\n${strFromU8(bytes)}`)
      .join('\n') + strFromU8(archive.bytes, true);
  const diagnostics = sentryBodies.join('\n');

  expect([
    ...leaks('AsyncStorage', stored),
    ...leaks('journal', journal),
    ...leaks('export', exported),
    ...leaks('diagnostics', diagnostics),
  ]).toEqual([]);
  // Each sink holds the synced data, so an empty sink cannot pass as a clean one.
  expect(authorizations).toEqual(
    expect.arrayContaining([
      `Bearer ${canaries.legacySessionToken}`,
      `Bearer ${canaries.providerToken}`,
    ]),
  );
  expect(stored).toContain('justgo.identity.managed.v1');
  expect(stored).toContain(uuid(1));
  expect(journal).toContain(reflection);
  expect(exported).toContain(reflection);
  expect(requests).toEqual(
    expect.arrayContaining([
      'POST /v1/completion-restores',
      'POST /v1/journal-sync',
    ]),
  );
  expect(sentryBodies).toHaveLength(1);
});
