import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/build-app.js';
import type { buildRuntimeApp } from '../../src/runtime-app.js';
import { createWorker, workerClientAddress } from '../../src/worker.js';
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
describe('Worker invocation lifecycle', () => {
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
      expect(await response.json()).toEqual({ status: 'unavailable' });
      expect(pending).not.toHaveBeenCalled();
    } finally {
      output.mockRestore();
    }
  });
});
