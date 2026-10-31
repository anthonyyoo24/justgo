import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/build-app.js';
import { buildRuntimeApp } from '../../src/runtime-app.js';
import { createWorker, workerClientAddress } from '../../src/worker.js';
import * as databaseClient from '../../src/db/client.js';
import * as errorReporters from '../../src/http/server-error-reporter.js';
import {
  readWorkerConfig,
  type createWorkerDatabase,
} from '../../src/db/worker-database.js';

const local =
  'postgresql://justgo_runtime:synthetic@127.0.0.1:54329/justgo_test';
const bindings = {
  HYPERDRIVE: { connectionString: local },
  LOCK_DATABASE_URL: local,
  NODE_ENV: 'production',
  APP_ENVIRONMENT: 'staging',
  DATABASE_SSL: 'disable',
  JUSTGO_SOURCE_SHA: 'a'.repeat(40),
  IDENTITY_RATE_LIMIT_KEY: 'synthetic-only-test-key-at-least-32-long',
};
const hostedBindings = {
  ...bindings,
  HYPERDRIVE: {
    connectionString: `postgresql://${'b'.repeat(32)}:${'c'.repeat(32)}@${'d'.repeat(32)}.workers.alt:5432/${'e'.repeat(32)}?sslmode=disable`,
  },
  LOCK_DATABASE_URL:
    'postgresql://justgo_runtime:synthetic@db.fixture.supabase.co:5432/postgres',
  DATABASE_SSL: 'verify-full',
  MANAGED_AUTH_ENABLED: 'true',
  SUPABASE_URL: 'https://fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'synthetic-publishable-key',
  SUPABASE_AUTH_SECRET_KEY: 'synthetic-auth-secret-with-at-least-32-characters',
  LOG_LEVEL: 'silent',
};
describe('Worker invocation lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses edge addresses only, never caller forwarded addresses', () => {
    expect(
      workerClientAddress(
        new Request('https://api.invalid', {
          headers: {
            'cf-connecting-ip': '2001:db8::1',
            'x-forwarded-for': 'spoof',
          },
        }),
      ),
    ).toBe('2001:db8::1');
    for (const headers of [
      { 'x-forwarded-for': '127.0.0.1' },
      { 'cf-connecting-ip': 'invalid, 1.2.3.4' },
    ])
      expect(
        workerClientAddress(new Request('https://api.invalid', { headers })),
      ).toBe('unknown');
  });
  it('opens per-request pools and settles cleanup even when sending an error', async () => {
    const end = vi.fn(async () => {});
    const database = { pool: { end }, db: {} } as unknown as ReturnType<
      typeof createWorkerDatabase
    >;
    const createDatabase = vi.fn(() => database);
    const appFactory = vi.fn<typeof buildRuntimeApp>(() =>
      buildApp({ checkDatabase: async () => {}, logger: false }),
    );
    const worker = createWorker({
      readConfiguration: readWorkerConfig,
      createDatabase,
      buildApp: appFactory,
    });
    const pending: Promise<unknown>[] = [];
    const execution = {
      waitUntil: (work: Promise<unknown>) => {
        pending.push(work);
      },
    };
    const responses = await Promise.all(
      ['/health', '/missing'].map((path) =>
        worker.fetch(
          new Request('https://api.invalid' + path),
          bindings,
          execution,
        ),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 404]);
    expect(createDatabase).toHaveBeenCalledTimes(2);
    expect(appFactory.mock.calls[0]?.[2]?.reportServerError).toBe(
      appFactory.mock.calls[1]?.[2]?.reportServerError,
    );
    await Promise.all(pending);
    expect(end).toHaveBeenCalledTimes(2);
  });
  it('serves health with release identity from a production managed-Auth wrapped binding without querying databases', async () => {
    const query = vi.fn();
    const end = vi.fn(async () => {});
    const database = { pool: { query, end }, db: {} } as unknown as ReturnType<
      typeof createWorkerDatabase
    >;
    const direct = vi.spyOn(databaseClient, 'createDatabase');
    const worker = createWorker({
      readConfiguration: readWorkerConfig,
      createDatabase: () => database,
      buildApp: buildRuntimeApp,
    });
    const pending: Promise<unknown>[] = [];
    const response = await worker.fetch(
      new Request('https://api.invalid/health'),
      hostedBindings,
      {
        waitUntil: (work) => {
          pending.push(work);
        },
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'justgo-api',
    });
    expect(response.headers.get('x-justgo-source-sha')).toBe(
      hostedBindings.JUSTGO_SOURCE_SHA,
    );
    expect(response.headers.get('x-justgo-environment')).toBe('staging');
    expect(response.headers.get('x-justgo-startup-stage')).toBeNull();
    expect(query).not.toHaveBeenCalled();
    expect(direct).not.toHaveBeenCalled();
    await Promise.all(pending);
    expect(end).toHaveBeenCalledOnce();
  });
  it.each([
    ['matching databases', true, true, 200],
    ['wrong Hyperdrive database', false, true, 503],
    ['wrong direct database', true, false, 503],
    ['missing Hyperdrive result', null, true, 503],
    ['missing direct result', true, null, 503],
  ] as const)(
    'checks both loopback database names for the legacy fixture: %s',
    async (_description, mainMatches, directMatches, status) => {
      const mainQuery = vi.fn(async () => ({
        rows: mainMatches === null ? [] : [{ database_ok: mainMatches }],
      }));
      const directQuery = vi.fn(async () => ({
        rows: directMatches === null ? [] : [{ database_ok: directMatches }],
      }));
      const end = vi.fn(async () => {});
      const directEnd = vi.fn(async () => {});
      const database = {
        pool: { query: mainQuery, end },
        db: {},
      } as unknown as ReturnType<typeof createWorkerDatabase>;
      const directDatabase = {
        pool: { query: directQuery, end: directEnd },
        db: {},
      } as unknown as ReturnType<typeof createWorkerDatabase>;
      vi.spyOn(databaseClient, 'createDatabase').mockReturnValue(
        directDatabase,
      );
      const checkRole = vi
        .spyOn(databaseClient, 'checkDatabase')
        .mockResolvedValue(undefined);
      const checkManagedAuth = vi
        .spyOn(databaseClient, 'checkManagedAuthDatabase')
        .mockResolvedValue(undefined);
      const worker = createWorker({
        readConfiguration: readWorkerConfig,
        createDatabase: () => database,
        buildApp: buildRuntimeApp,
      });
      const pending: Promise<unknown>[] = [];
      const response = await worker.fetch(
        new Request('https://api.invalid/ready'),
        bindings,
        {
          waitUntil: (work) => {
            pending.push(work);
          },
        },
      );
      expect(response.status).toBe(status);
      expect(response.headers.get('x-justgo-startup-stage')).toBeNull();
      expect(await response.json()).toEqual({
        status: status === 200 ? 'ready' : 'unavailable',
      });
      const expectedQuery = [
        'select current_database()::text = $1::text as database_ok',
        ['justgo_test'],
      ];
      expect(mainQuery).toHaveBeenCalledExactlyOnceWith(...expectedQuery);
      if (mainMatches)
        expect(directQuery).toHaveBeenCalledExactlyOnceWith(...expectedQuery);
      else expect(directQuery).not.toHaveBeenCalled();
      expect(checkRole).toHaveBeenNthCalledWith(1, database.pool);
      expect(checkManagedAuth).not.toHaveBeenCalled();
      if (status === 200) {
        expect(checkRole).toHaveBeenNthCalledWith(2, directDatabase.pool);
      }
      await Promise.all(pending);
      expect(end).toHaveBeenCalledOnce();
      expect(directEnd).toHaveBeenCalledOnce();
    },
  );
  it.each([
    ['ready', true, 200],
    ['wrong database', false, 503],
    ['missing database proof', null, 503],
    ['runtime grants', true, 503],
    ['managed Auth capability', true, 503],
  ] as const)(
    'validates managed readiness through Hyperdrive without a direct TLS socket: %s',
    async (failure, matches, status) => {
      const query = vi.fn(async () => ({
        rows: matches === null ? [] : [{ database_ok: matches }],
      }));
      const end = vi.fn(async () => {});
      const database = {
        pool: { query, end },
        db: {},
      } as unknown as ReturnType<typeof createWorkerDatabase>;
      const direct = vi.spyOn(databaseClient, 'createDatabase');
      const role = vi.spyOn(databaseClient, 'checkDatabase');
      const managed = vi.spyOn(databaseClient, 'checkManagedAuthDatabase');
      role.mockImplementation(async () => {
        if (failure === 'runtime grants')
          throw new Error('private role details');
      });
      managed.mockImplementation(async () => {
        if (failure === 'managed Auth capability')
          throw new Error('private Auth details');
      });
      const worker = createWorker({
        readConfiguration: readWorkerConfig,
        createDatabase: () => database,
        buildApp: buildRuntimeApp,
      });
      const pending: Promise<unknown>[] = [];
      const response = await worker.fetch(
        new Request('https://api.invalid/ready'),
        hostedBindings,
        { waitUntil: (work) => pending.push(work) },
      );
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({
        status: status === 200 ? 'ready' : 'unavailable',
      });
      expect(role).toHaveBeenCalledWith(database.pool);
      if (failure !== 'runtime grants')
        expect(managed).toHaveBeenCalledWith(database.pool);
      expect(direct).not.toHaveBeenCalled();
      await Promise.all(pending);
      expect(end).toHaveBeenCalledOnce();
    },
  );
  it.each(['configuration', 'reporter', 'database'] as const)(
    'reports only the fixed %s startup stage with the redacted health failure',
    async (stage) => {
      const output = vi.spyOn(console, 'error').mockImplementation(() => {});
      const createDatabase = vi.fn(() => {
        throw new Error('private database URL');
      });
      const compose = vi.fn(buildRuntimeApp);
      if (stage === 'reporter')
        vi.spyOn(
          errorReporters,
          'createServerErrorReporter',
        ).mockImplementation(() => {
          throw new Error('private Sentry secret');
        });
      const worker = createWorker({
        readConfiguration: readWorkerConfig,
        createDatabase,
        buildApp: compose,
      });
      const pending = vi.fn();
      const response = await worker.fetch(
        new Request('https://api.invalid/health', {
          headers: { 'x-justgo-startup-stage': 'caller-controlled-secret' },
        }),
        stage === 'configuration'
          ? { ...bindings, JUSTGO_SOURCE_SHA: 'private invalid source' }
          : bindings,
        { waitUntil: pending },
      );
      expect(response.status).toBe(500);
      expect(response.headers.get('x-justgo-startup-stage')).toBe(stage);
      expect(response.headers.get('x-justgo-source-sha')).toBeNull();
      expect(response.headers.get('x-justgo-environment')).toBeNull();
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('content-type')).toMatch(
        /^application\/json/,
      );
      expect(await response.json()).toEqual({
        error: 'Internal server error',
        requestId: response.headers.get('x-request-id'),
      });
      expect(createDatabase).toHaveBeenCalledTimes(
        stage === 'database' ? 1 : 0,
      );
      expect(compose).not.toHaveBeenCalled();
      expect(pending).not.toHaveBeenCalled();
      expect(JSON.stringify(output.mock.calls)).not.toMatch(/private|secret/);
    },
  );
  it('hides startup failures and closes allocated pools on composition failure', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const end = vi.fn(async () => {
        throw new Error('private database URL');
      });
      const database = { pool: { end }, db: {} } as unknown as ReturnType<
        typeof createWorkerDatabase
      >;
      const worker = createWorker({
        readConfiguration: readWorkerConfig,
        createDatabase: () => database,
        buildApp: () => {
          throw new Error('private secret');
        },
      });
      const pending: Promise<unknown>[] = [];
      const response = await worker.fetch(
        new Request('https://api.invalid/v1/account'),
        bindings,
        {
          waitUntil: (work) => {
            pending.push(work);
          },
        },
      );
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        code: 'UNAVAILABLE',
        requestId: expect.any(String),
      });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response.headers.get('x-justgo-startup-stage')).toBe(
        'composition',
      );
      expect(response.headers.get('x-justgo-source-sha')).toBeNull();
      expect(response.headers.get('x-justgo-environment')).toBeNull();
      await Promise.all(pending);
      expect(end).toHaveBeenCalledOnce();
      expect(JSON.stringify(output.mock.calls)).not.toMatch(/private|secret/);
    } finally {
      output.mockRestore();
    }
  });
  it('fails readiness when configuration is absent', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const pending = vi.fn();
      const response = await createWorker().fetch(
        new Request('https://api.invalid/ready'),
        {},
        { waitUntil: pending },
      );
      expect(response.status).toBe(503);
      expect(response.headers.get('x-justgo-startup-stage')).toBe(
        'configuration',
      );
      expect(await response.json()).toEqual({ status: 'unavailable' });
      expect(pending).not.toHaveBeenCalled();
    } finally {
      output.mockRestore();
    }
  });
  it('does not misclassify a rejected app fetch as a startup failure', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => {});
    const end = vi.fn(async () => {});
    const database = { pool: { end }, db: {} } as unknown as ReturnType<
      typeof createWorkerDatabase
    >;
    const app = buildApp({ checkDatabase: async () => {}, logger: false });
    vi.spyOn(app, 'fetch').mockRejectedValue(
      new Error('private request secret'),
    );
    const worker = createWorker({
      readConfiguration: readWorkerConfig,
      createDatabase: () => database,
      buildApp: () => app,
    });
    const pending: Promise<unknown>[] = [];
    const response = await worker.fetch(
      new Request('https://api.invalid/health'),
      bindings,
      {
        waitUntil: (work) => {
          pending.push(work);
        },
      },
    );
    expect(response.status).toBe(500);
    expect(response.headers.get('x-justgo-startup-stage')).toBeNull();
    expect(response.headers.get('x-justgo-source-sha')).toBeNull();
    expect(response.headers.get('x-justgo-environment')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      error: 'Internal server error',
      requestId: response.headers.get('x-request-id'),
    });
    await Promise.all(pending);
    expect(end).toHaveBeenCalledOnce();
    expect(JSON.stringify(output.mock.calls)).not.toMatch(/private|secret/);
  });
});
