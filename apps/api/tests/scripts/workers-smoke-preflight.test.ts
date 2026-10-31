import { readFileSync } from 'node:fs';
import { createServer, type AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import {
  assertWorkerPortAvailable,
  workerSmokeOptions,
} from '../../scripts/workers-smoke-preflight.js';

describe('explicit Worker check commands', () => {
  it.each([undefined, 'true', 'false', 'leftover-invalid-value'])(
    'always selects functional smoke despite legacy profiling setting %s',
    (legacy) => {
      const environment = {
        JUSTGO_WORKERS_CPU_PROFILE: legacy,
        JUSTGO_WORKERS_INSPECTOR_PORT: 'ignored-in-smoke',
      };
      for (const args of [[], ['--smoke']])
        expect(workerSmokeOptions(args, environment)).toEqual({
          profiling: false,
          port: 8791,
          inspectorPort: 0,
        });
    },
  );

  it('profiles only when explicitly requested and keeps both ports configurable', () => {
    expect(
      workerSmokeOptions(['--profile'], {
        JUSTGO_WORKERS_CPU_PROFILE: 'false',
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
        await expect(assertWorkerPortAvailable(port, label)).rejects.toThrow(
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
