import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  assertWorkerPortAvailable,
  workerSmokeOptions,
  workerSmokePreflightMessage,
} from '../../scripts/workers-smoke-preflight.js';

describe('explicit Worker check commands', () => {
  it('selects functional smoke by default and with the explicit smoke command', () => {
    const environment = {
      JUSTGO_WORKERS_INSPECTOR_PORT: 'ignored-in-smoke',
    };
    for (const args of [[], ['--smoke']])
      expect(workerSmokeOptions(args, environment)).toEqual({
        profiling: false,
        port: 8791,
        inspectorPort: 0,
      });
  });

  it('profiles only when explicitly requested and keeps both ports configurable', () => {
    expect(
      workerSmokeOptions(['--profile'], {
        JUSTGO_WORKERS_TEST_PORT: '8792',
        JUSTGO_WORKERS_INSPECTOR_PORT: '9231',
      }),
    ).toEqual({ profiling: true, port: 8792, inspectorPort: 9231 });
    expect(workerSmokeOptions(['--profile'], {})).toEqual({
      profiling: true,
      port: 8791,
      inspectorPort: 9230,
    });
  });

  it.each([['--unknown'], ['--smoke', '--profile'], ['--profile', '--smoke']])(
    'rejects ambiguous or unknown mode arguments %j',
    (...args) => {
      expect(() => workerSmokeOptions(args, {})).toThrow(
        'Invalid Worker check mode',
      );
    },
  );

  it.each(['0', '80', '65536', '8791.5', 'not-a-port'])(
    'rejects invalid runtime port %s',
    (port) => {
      expect(() =>
        workerSmokeOptions(['--smoke'], { JUSTGO_WORKERS_TEST_PORT: port }),
      ).toThrow('Invalid Worker smoke port');
    },
  );

  it.each(['0', '80', '65536', '9230.5', 'not-a-port', '8791'])(
    'rejects invalid or overlapping inspector port %s',
    (port) => {
      expect(() =>
        workerSmokeOptions(['--profile'], {
          JUSTGO_WORKERS_INSPECTOR_PORT: port,
        }),
      ).toThrow('Invalid Worker CPU inspector port');
    },
  );

  it('binds the npm smoke and profiler commands to their distinct explicit modes', () => {
    const api = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as { scripts: Record<string, string> };
    const root = JSON.parse(
      readFileSync(
        new URL('../../../../package.json', import.meta.url),
        'utf8',
      ),
    ) as { scripts: Record<string, string> };
    expect(api.scripts['test:workers']).toMatch(/workers-smoke\.ts --smoke$/);
    expect(api.scripts['profile:workers']).toMatch(
      /workers-smoke\.ts --profile$/,
    );
    expect(root.scripts['test:workers']).toBe(
      'npm run test:workers -w @justgo/api',
    );
    expect(root.scripts['profile:workers']).toBe(
      'npm run profile:workers -w @justgo/api',
    );
  });

  it('retains only its private fixed message after mutation and rejects lookalikes', () => {
    let error: unknown;
    try {
      workerSmokeOptions(['--unknown'], {});
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(Error);
    Object.assign(error as Error, { message: 'PRIVATE_PREFLIGHT_INPUT' });
    expect(workerSmokePreflightMessage(error)).toBe(
      'Invalid Worker check mode',
    );
    for (const untrusted of [
      new Error('Invalid Worker check mode'),
      { message: 'Invalid Worker check mode' },
      new Error('PRIVATE_PREFLIGHT_INPUT'),
      null,
      undefined,
      'PRIVATE_PREFLIGHT_INPUT',
    ])
      expect(workerSmokePreflightMessage(untrusted)).toBeUndefined();
  });
});

describe('Worker loopback port preflight', () => {
  it.each(['Worker smoke', 'Worker CPU inspector'] as const)(
    'rejects an occupied %s port and releases its own successful probe',
    async (label) => {
      const occupied = createServer();
      await new Promise<void>((resolve, reject) => {
        occupied.once('error', reject);
        occupied.listen(0, '127.0.0.1', resolve);
      });
      const port = (occupied.address() as AddressInfo).port;
      try {
        const failure: unknown = await assertWorkerPortAvailable(
          port,
          label,
        ).catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(Error);
        expect(workerSmokePreflightMessage(failure)).toBe(
          `${label} port is occupied`,
        );
      } finally {
        await new Promise<void>((resolve, reject) =>
          occupied.close((error) => (error ? reject(error) : resolve())),
        );
      }
      await assertWorkerPortAvailable(port, label);
      // A second successful probe demonstrates that the first one closed.
      await assertWorkerPortAvailable(port, label);
    },
  );
});

function runSmoke(
  args: string[],
  environment: Record<string, string | undefined> = {},
) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      'tsx',
      fileURLToPath(new URL('../../scripts/workers-smoke.ts', import.meta.url)),
      ...args,
    ],
    {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      encoding: 'utf8',
      timeout: 10000,
      // The CLI stops before database/runtime setup; never load saved settings.
      env: {
        PATH: process.env.PATH,
        NODE_ENV: 'test',
        NO_COLOR: '1',
        DATABASE_URL:
          'postgres://justgo_runtime:synthetic@127.0.0.1:1/justgo_test',
        MIGRATION_DATABASE_URL:
          'postgres://justgo_migrator:synthetic@127.0.0.1:1/justgo_test',
        DATABASE_SSL: 'disable',
        ...environment,
      },
    },
  );
}

function expectPreflightOutput(
  result: ReturnType<typeof runSmoke>,
  message: string,
) {
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe('');
  expect(result.stderr).toBe(`${message}\n`);
  expect(result.stderr).not.toContain('PRIVATE_PREFLIGHT_INPUT');
}

describe('actual Worker smoke preflight diagnostics', () => {
  it('redacts unbranded preflight failures', () => {
    expectPreflightOutput(
      runSmoke(['--smoke'], { DATABASE_URL: 'PRIVATE_PREFLIGHT_INPUT' }),
      'Workers smoke failed preflight or cleanup; no raw runtime output retained.',
    );
  });

  it.each([
    {
      args: ['--PRIVATE_PREFLIGHT_INPUT'],
      environment: {},
      message: 'Invalid Worker check mode',
    },
    {
      args: ['--smoke'],
      environment: { JUSTGO_WORKERS_TEST_PORT: 'PRIVATE_PREFLIGHT_INPUT' },
      message: 'Invalid Worker smoke port',
    },
    {
      args: ['--profile'],
      environment: { JUSTGO_WORKERS_INSPECTOR_PORT: 'PRIVATE_PREFLIGHT_INPUT' },
      message: 'Invalid Worker CPU inspector port',
    },
  ])(
    'prints the fixed $message without input values',
    ({ args, environment, message }) => {
      expectPreflightOutput(runSmoke(args, environment), message);
    },
  );

  it('prints the occupied inspector reason before database or runtime setup', async () => {
    const inspector = createServer();
    const runtime = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        inspector.once('error', reject);
        inspector.listen(0, '127.0.0.1', resolve);
      });
      await new Promise<void>((resolve, reject) => {
        runtime.once('error', reject);
        runtime.listen(0, '127.0.0.1', resolve);
      });
      const runtimePort = (runtime.address() as AddressInfo).port;
      await new Promise<void>((resolve, reject) =>
        runtime.close((error) => (error ? reject(error) : resolve())),
      );
      const inspectorPort = (inspector.address() as AddressInfo).port;
      expectPreflightOutput(
        runSmoke(['--profile'], {
          JUSTGO_WORKERS_TEST_PORT: String(runtimePort),
          JUSTGO_WORKERS_INSPECTOR_PORT: String(inspectorPort),
        }),
        'Worker CPU inspector port is occupied',
      );
    } finally {
      for (const server of [runtime, inspector])
        if (server.listening)
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
    }
  });
});
