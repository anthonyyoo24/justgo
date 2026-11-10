import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  canaryKinds,
  deployReceipt,
  derivedMasks,
  envFileText,
  functionSecrets,
  logDialects,
  logRowLimit,
  readDeleteRequest,
  readDeployRequest,
  readLogsRequest,
  scanLogs,
} from '../../scripts/edge-trial/hosted-ci.js';
import {
  addressMasker,
  clientAddressVerdict,
  cpuLimitConclusion,
  decision,
  deployReceiptVerdict,
  isPublicAddress,
  logCanaryVerdict,
  perfVerdict,
  receiptNames,
  regionDecision,
  renderReport,
  runLanes,
  stats,
  type BurnStep,
  type LaneId,
} from '../../scripts/edge-trial/hosted-lanes.js';
import {
  clientAddressHeaders,
  createHostedTrialHandler,
  trialKeyHeader,
} from '../../scripts/edge-trial/hosted.js';

type Json = Record<string, unknown>;

const trialKey = 'unit-test-trial-key';
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const sourceSha = 'c'.repeat(40);
const functionUrl =
  'https://abcdefghijklmnopqrst.supabase.co/functions/v1/justgo-trial';
const workerUrl = 'https://worker.example';
const realAddress = '192.0.2.44';

function fakeDatabase(options: { fail?: Error } = {}) {
  const queries: string[] = [];
  const released: unknown[] = [];
  const database = {
    pool: {
      connect: () =>
        Promise.resolve({
          query: (sql: string) => {
            queries.push(sql);
            if (options.fail && sql === 'show statement_timeout')
              return Promise.reject(options.fail);
            return Promise.resolve({
              rows:
                sql === 'show statement_timeout'
                  ? [{ statement_timeout: '4321ms' }]
                  : [],
            });
          },
          release: (failed: unknown) => released.push(failed),
        }),
    },
  };
  return { database, queries, released };
}

type Handler = NonNullable<Parameters<typeof createHostedTrialHandler>[1]>;

/** Stands in for the production Edge handler behind the trial wrapper. */
function fakeApi(database?: unknown) {
  const seen: { method: string; path: string; search: string; body: string }[] =
    [];
  let requests = 0;
  const handler = {
    database,
    fetch: async (request: Request) => {
      const url = new URL(request.url);
      const body = await request.text();
      seen.push({
        method: request.method,
        path: url.pathname,
        search: url.search,
        body,
      });
      const requestId = `request-${++requests}`;
      const reply = (value: Json, status = 200, extra: HeadersInit = {}) =>
        Response.json(status >= 400 ? { ...value, requestId } : value, {
          status,
          headers: { 'x-request-id': requestId, ...extra },
        });
      const identity = {
        'x-justgo-source-sha': sourceSha,
        'x-justgo-environment': 'staging',
      };
      const route = `${request.method} ${url.pathname}`;
      if (route === 'GET /api/health')
        return reply({ status: 'ok', service: 'justgo-api' }, 200, identity);
      if (route === 'GET /api/ready')
        return reply({ status: 'ready' }, 200, identity);
      if (route === 'GET /api/v1/guest/challenges')
        return reply({ cards: [{ id: 'card-1' }, { id: 'card-2' }] });
      if (route === 'GET /api/v1/access')
        return reply({ code: 'UNAUTHORIZED' }, 401);
      if (route === 'POST /api/v1/journal-sync') {
        if (Buffer.byteLength(body) > 4 * 1024 * 1024)
          return reply({ code: 'PAYLOAD_TOO_LARGE' }, 413);
        return request.headers.has('authorization')
          ? reply({ code: 'VALIDATION_FAILED' }, 400)
          : reply({ code: 'UNAUTHORIZED' }, 401);
      }
      return reply({ code: 'NOT_FOUND' }, 404);
    },
  };
  return { handler: handler as unknown as Handler, seen };
}

function trialHandler(env: Record<string, string> = {}, fail?: Error) {
  const { database, queries, released } = fakeDatabase(fail ? { fail } : {});
  const api = fakeApi(database);
  const hosted = createHostedTrialHandler(
    { JUSTGO_TRIAL_KEY_SHA256: sha256(trialKey), ...env },
    api.handler,
  );
  return { hosted, queries, released, seen: api.seen };
}

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`${functionUrl}${path}`, { headers });
const keyed = { [trialKeyHeader]: trialKey };

describe('hosted trial entry', () => {
  it('passes every route to the API under the production prefix', async () => {
    const { hosted, seen } = trialHandler();
    await hosted.fetch(get('/health?x=1'));
    await hosted.fetch(
      new Request('https://edge.internal/justgo-trial/v1/journal-sync', {
        method: 'POST',
        body: '{"a":1}',
      }),
    );
    await hosted.fetch(new Request('https://edge.internal/justgo-trial'));
    await hosted.fetch(new Request('https://edge.internal/other/health'));
    expect(seen).toEqual([
      { method: 'GET', path: '/api/health', search: '?x=1', body: '' },
      {
        method: 'POST',
        path: '/api/v1/journal-sync',
        search: '',
        body: '{"a":1}',
      },
      { method: 'GET', path: '/api', search: '', body: '' },
      { method: 'GET', path: '/other/health', search: '', body: '' },
    ]);
  });

  it.each([
    ['no key', {}, {}],
    ['a wrong key', { [trialKeyHeader]: 'wrong' }, {}],
    ['no configured digest', keyed, { JUSTGO_TRIAL_KEY_SHA256: '' }],
    ['a malformed digest', keyed, { JUSTGO_TRIAL_KEY_SHA256: 'abc' }],
  ])('hides the trial routes from %s', async (_name, headers, env) => {
    const { hosted, seen, queries } = trialHandler(env);
    for (const path of ['/__trial/probe', '/__trial/burn?ms=5']) {
      const response = await hosted.fetch(get(path, headers));
      expect(response.status).toBe(404);
    }
    expect(seen.map((request) => request.path)).toEqual([
      '/api/__trial/probe',
      '/api/__trial/burn',
    ]);
    expect(queries).toEqual([]);
  });

  it('probes with read-only statements and echoes only address headers', async () => {
    const { hosted, queries, released } = trialHandler({
      DATABASE_URL: 'postgresql://user:p4ss-FAKE@db.example:6543/postgres',
    });
    const response = await hosted.fetch(
      get('/__trial/probe', {
        ...keyed,
        authorization: 'Bearer should-not-echo',
        cookie: 'should-not-echo',
        'x-real-ip': '203.0.113.8',
      }),
    );
    const body = (await response.json()) as Json;
    expect(Object.keys(body).sort()).toEqual([
      'clientAddressHeaders',
      'database',
      'worker',
    ]);
    expect(Object.keys(body.clientAddressHeaders as Json).sort()).toEqual(
      [...clientAddressHeaders].sort(),
    );
    expect(body.clientAddressHeaders).toMatchObject({
      'x-real-ip': '203.0.113.8',
      'x-forwarded-for': null,
    });
    const text = JSON.stringify(body);
    for (const hidden of [
      'should-not-echo',
      trialKey,
      'p4ss-FAKE',
      'db.example',
    ])
      expect(text).not.toContain(hidden);
    expect(queries).toEqual([
      'begin',
      'show statement_timeout',
      ...Array.from({ length: 11 }, () => 'select 1'),
      'commit',
    ]);
    expect(released).toEqual([false]);
    const database = body.database as {
      statementTimeout: string;
      selectOne: { samplesMs: number[]; medianMs: number };
    };
    expect(database.statementTimeout).toBe('4321ms');
    expect(database.selectOne.samplesMs).toHaveLength(10);
  });

  it('reports a database failure without the connection string', async () => {
    const failure = Object.assign(
      new Error(
        'unsupported startup parameter for user:p4ss-FAKE at db.example',
      ),
      { code: '08P01', severity: 'FATAL' },
    );
    const { hosted, released } = trialHandler(
      { DATABASE_URL: 'postgresql://user:p4ss-FAKE@db.example:6543/postgres' },
      failure,
    );
    const response = await hosted.fetch(get('/__trial/probe', keyed));
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({
      database: { error: { code: '08P01', severity: 'FATAL' } },
    });
    expect(text).not.toContain('p4ss-FAKE');
    expect(text).not.toContain('db.example');
    expect(released).toEqual([true]);
  });

  it('bounds the burn and names the worker on every reply', async () => {
    const { hosted } = trialHandler();
    for (const ms of ['0', '2501', '1.5', 'abc', ''])
      expect(
        (await hosted.fetch(get(`/__trial/burn?ms=${ms}`, keyed))).status,
      ).toBe(400);
    const burns = [];
    for (const ms of [5, 10])
      burns.push(
        (await (
          await hosted.fetch(get(`/__trial/burn?ms=${ms}`, keyed))
        ).json()) as {
          requestedMs: number;
          burnedMs: number;
          worker: { id: string; bootedAt: string; served: number };
        },
      );
    expect(burns[0]?.burnedMs).toBeGreaterThanOrEqual(5);
    expect(burns[1]?.burnedMs).toBeGreaterThanOrEqual(10);
    expect(burns[1]?.worker.id).toBe(burns[0]?.worker.id);
    expect(burns[1]?.worker.served).toBe((burns[0]?.worker.served ?? 0) + 1);
  });

  it('counts body bytes without keeping the body', async () => {
    const { hosted } = trialHandler();
    const response = await hosted.fetch(
      new Request(`${functionUrl}/__trial/body`, {
        method: 'POST',
        headers: keyed,
        body: 'a'.repeat(70_000),
      }),
    );
    expect(await response.json()).toMatchObject({ bytes: 70_000 });
  });
});

const fakeEnv = {
  SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
  GITHUB_SHA: sourceSha,
  EDGE_DATABASE_URL:
    'postgresql://justgo_runtime.abcdefghijklmnopqrst:p4ss%2FFAKE@pooler.example:6543/postgres',
  EDGE_DATABASE_CA_CERT:
    '-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----\n',
  JUSTGO_AUTH_PUBLISHABLE_KEY: 'sb_publishable_fake',
  JUSTGO_AUTH_SECRET_KEY: 'sb_secret_fake_'.padEnd(40, 'x'),
};
const deployRequest = {
  requestedAt: '2026-11-09T10:00:00.000Z',
  trialKeySha256: sha256(trialKey),
};
const rateLimitKey = 'r'.repeat(64);

describe('hosted trial workflow helper', () => {
  it('reads only well-formed request files', () => {
    expect(readDeployRequest(JSON.stringify(deployRequest))).toEqual(
      deployRequest,
    );
    expect(readDeleteRequest('{"requestedAt":"2026-11-09T10:00:00Z"}')).toEqual(
      { requestedAt: '2026-11-09T10:00:00Z' },
    );
    for (const bad of [
      'not json',
      '[]',
      JSON.stringify({ ...deployRequest, extra: 1 }),
      JSON.stringify({ ...deployRequest, trialKeySha256: trialKey }),
      JSON.stringify({ ...deployRequest, requestedAt: 'yesterday' }),
    ])
      expect(() => readDeployRequest(bad)).toThrow();
    const logs = {
      requestedAt: '2026-11-09T10:20:00Z',
      from: '2026-11-09T10:00:00Z',
      to: '2026-11-09T10:10:00Z',
      nonce: '0123456789abcdef',
    };
    expect(readLogsRequest(JSON.stringify(logs))).toEqual(logs);
    for (const bad of [
      { ...logs, to: logs.from },
      { ...logs, to: '2026-11-09T17:00:00Z' },
      { ...logs, nonce: 'XYZ' },
    ])
      expect(() => readLogsRequest(JSON.stringify(bad))).toThrow();
  });

  it('builds the whole function configuration from four secrets', () => {
    const now = new Date('2026-11-09T12:00:00Z');
    const secrets = functionSecrets(fakeEnv, deployRequest, now, rateLimitKey);
    expect(Object.keys(secrets).sort()).toEqual([
      'APP_ENVIRONMENT',
      'BETA_ACCESS_WINDOW',
      'DATABASE_CA_CERT',
      'DATABASE_URL',
      'IDENTITY_RATE_LIMIT_KEY',
      'JUSTGO_AUTH_PUBLISHABLE_KEY',
      'JUSTGO_AUTH_SECRET_KEY',
      'JUSTGO_SOURCE_SHA',
      'JUSTGO_TRIAL_KEY_SHA256',
      'MANAGED_AUTH_ENABLED',
      'NODE_ENV',
    ]);
    expect(secrets).toMatchObject({
      DATABASE_URL: fakeEnv.EDGE_DATABASE_URL,
      NODE_ENV: 'production',
      APP_ENVIRONMENT: 'staging',
      JUSTGO_SOURCE_SHA: sourceSha,
      JUSTGO_TRIAL_KEY_SHA256: deployRequest.trialKeySha256,
    });
    expect(JSON.parse(secrets.BETA_ACCESS_WINDOW ?? '')).toEqual({
      startsAt: '2026-11-09T11:00:00.000Z',
      expiresAt: '2026-11-12T12:00:00.000Z',
    });
  });

  it.each([
    [
      'EDGE_DATABASE_URL',
      'postgresql://justgo_runtime.abcdefghijklmnopqrst:p4ss-FAKE@pooler.example:5432/postgres',
    ],
    [
      'EDGE_DATABASE_URL',
      'postgresql://postgres.abcdefghijklmnopqrst:p4ss-FAKE@pooler.example:6543/postgres',
    ],
    ['EDGE_DATABASE_URL', 'p4ss-FAKE not a url'],
    ['EDGE_DATABASE_URL', ''],
    ['EDGE_DATABASE_CA_CERT', 'p4ss-FAKE'],
    ['JUSTGO_AUTH_SECRET_KEY', 'p4ss-FAKE'],
    ['SUPABASE_PROJECT_REF', 'p4ss-FAKE'],
  ])('rejects a bad %s without printing it', (name, value) => {
    let message = '';
    try {
      functionSecrets(
        { ...fakeEnv, [name]: value },
        deployRequest,
        new Date(),
        rateLimitKey,
      );
    } catch (error) {
      message = error instanceof Error ? error.message : '';
    }
    expect(message).toContain(name);
    expect(message).not.toContain('p4ss-FAKE');
  });

  it('quotes each value so dotenv reads it back unchanged', () => {
    expect(
      envFileText({
        PEM: '-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----\n',
        PLAIN: 'value with spaces # and = signs',
        APOSTROPHE: "it's",
        BOTH: "it's a `tick`",
      }),
    ).toBe(
      [
        "PEM='-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----\n'",
        "PLAIN='value with spaces # and = signs'",
        "APOSTROPHE=`it's`",
        'BOTH="it\'s a `tick`"',
        '',
      ].join('\n'),
    );
    for (const [name, value] of [
      ['EVERY_QUOTE', `'\`"`],
      ['ESCAPE', `'\`\\n`],
      ['TRAILING_BACKSLASH', 'value\\'],
      ['SUPABASE_URL', 'x'],
      ['lower', 'x'],
    ] as const) {
      let message = '';
      try {
        envFileText({ [name]: value });
      } catch (error) {
        message = error instanceof Error ? error.message : '';
      }
      expect(message).toContain(name);
      expect(message).not.toContain(value);
    }
  });

  it('masks the values GitHub does not mask on its own', () => {
    const secrets = functionSecrets(
      fakeEnv,
      deployRequest,
      new Date(),
      rateLimitKey,
    );
    expect(derivedMasks(secrets).sort()).toEqual(
      ['p4ss%2FFAKE', 'p4ss/FAKE', rateLimitKey].sort(),
    );
  });

  const listed = (version: number, hash = 'e'.repeat(64)) => [
    { slug: 'other', version: 9, status: 'ACTIVE' },
    {
      id: 'function-id',
      slug: 'justgo-trial',
      status: 'ACTIVE',
      version,
      verify_jwt: false,
      ezbr_sha256: hash,
    },
  ];
  const receiptInput = {
    bundle: { bytes: 10, sha256: 'b'.repeat(64) },
    functionsAfterDeploy: listed(3),
    functionsAfterRepeat: listed(3),
    secrets: [
      { name: 'DATABASE_URL', value: 'digest-must-not-be-kept' },
      { name: 'NODE_ENV', value: 'digest-must-not-be-kept' },
    ],
    repeatDeployLog: 'No change found in Function: justgo-trial\n',
    sourceSha,
    cliVersion: '3.1.0',
    runUrl: 'local',
    expectedSecretNames: ['DATABASE_URL', 'NODE_ENV'],
  };

  it('writes a lane 10 receipt with secret names only', () => {
    const receipt = deployReceipt(receiptInput);
    expect(receipt.pass).toBe(true);
    expect(receipt.function).toMatchObject({
      version: 3,
      ezbrSha256: 'e'.repeat(64),
      verifyJwt: false,
    });
    expect(receipt.secretNames).toEqual(['DATABASE_URL', 'NODE_ENV']);
    expect(JSON.stringify(receipt)).not.toContain('digest-must-not-be-kept');
    expect(deployReceiptVerdict(receipt)).toEqual({
      pass: true,
      holdsSecretNamesOnly: true,
      sourceSha,
    });
    expect(
      deployReceiptVerdict({ ...receipt, secrets: [{ value: 'x' }] }),
    ).toMatchObject({ pass: false, holdsSecretNamesOnly: false });
  });

  it.each([
    [
      'the repeat deploy uploaded a new bundle',
      { repeatDeployLog: 'Deployed Functions' },
    ],
    [
      'the repeat deploy changed the version',
      { functionsAfterRepeat: listed(4) },
    ],
    ['the function is missing', { functionsAfterDeploy: [] }],
    [
      'a secret name is missing',
      { expectedSecretNames: ['DATABASE_URL', 'ABSENT'] },
    ],
    [
      'JWT verification is on',
      { functionsAfterDeploy: [{ ...listed(3)[1], verify_jwt: true }] },
    ],
  ])('fails lane 10 when %s', (_name, change) => {
    expect(deployReceipt({ ...receiptInput, ...change }).pass).toBe(false);
  });

  const nonce = '0123456789abcdef';
  const logWindow = {
    from: '2026-11-09T10:00:00Z',
    to: '2026-11-09T10:10:00Z',
    nonce,
  };
  const marker = {
    id: 'row-1',
    timestamp: 1,
    event_message: `GET | 404 | /functions/v1/justgo-trial/__canary/${canaryKinds.marker}${nonce}`,
  };
  const consoleRow = { id: 'row-2', event_message: 'incoming request' };
  const legacyQuery = (rows: Record<string, unknown[]>) => (sql: string) =>
    Promise.resolve(
      sql.includes('from logs')
        ? { error: 'Unknown table logs', fatal: false }
        : {
            rows:
              Object.entries(rows).find(([source]) =>
                sql.includes(`from ${source} `),
              )?.[1] ?? [],
          },
    );

  it('calls the logs clean only with the marker seen and every source read', async () => {
    const queries: string[] = [];
    const query = legacyQuery({
      function_edge_logs: [marker],
      function_logs: [consoleRow],
    });
    const scan = await scanLogs(logWindow, (sql) => {
      queries.push(sql);
      return query(sql);
    });
    expect(scan.verdict).toBe('clean');
    expect(scan.sources.map((source) => source.dialect)).toEqual([
      'legacy',
      'legacy',
      'legacy',
      'legacy',
    ]);
    expect(queries).toEqual([
      logDialects.unified('function_edge_logs'),
      logDialects.legacy('function_edge_logs'),
      logDialects.legacy('function_logs'),
      logDialects.legacy('edge_logs'),
      logDialects.legacy('auth_logs'),
    ]);
  });

  it('finds a leaked canary and keeps the log text out of the receipt', async () => {
    const scan = await scanLogs(
      logWindow,
      legacyQuery({
        function_edge_logs: [marker],
        function_logs: [consoleRow],
        edge_logs: [
          {
            id: 'row-9',
            timestamp: 5,
            metadata: [
              {
                request: {
                  headers: {
                    authorization: `Bearer ${canaryKinds.bearer.toLowerCase()}${nonce} private-neighbour-text`,
                  },
                },
              },
            ],
          },
        ],
      }),
    );
    expect(scan.verdict).toBe('found');
    expect(scan.leaked).toEqual([
      {
        source: 'edge_logs',
        kind: 'bearer',
        nonceMatch: true,
        id: 'row-9',
        timestamp: '5',
        path: 'metadata[0].request.headers.authorization',
      },
    ]);
    expect(JSON.stringify(scan)).not.toContain('private-neighbour-text');
  });

  it.each([
    ['the marker is missing', { function_logs: [consoleRow] }, undefined],
    ['the console log is empty', { function_edge_logs: [marker] }, undefined],
    [
      'a source hits the row limit',
      {
        function_edge_logs: [marker],
        function_logs: Array.from({ length: logRowLimit }, () => consoleRow),
      },
      undefined,
    ],
    ['the API refuses the token', {}, { error: 'HTTP 401', fatal: true }],
  ])('calls the logs inconclusive when %s', async (_name, rows, failure) => {
    let calls = 0;
    const query = legacyQuery(rows);
    const scan = await scanLogs(logWindow, (sql) => {
      calls++;
      return failure ? Promise.resolve(failure) : query(sql);
    });
    expect(scan.verdict).toBe('inconclusive');
    expect(scan.reasons.length).toBeGreaterThan(0);
    if (failure) expect(calls).toBe(1);
  });
});

describe('hosted lanes analysis', () => {
  it('uses the nearest-rank p95 of the first trial', () => {
    const values = Array.from({ length: 50 }, (_unused, index) => index + 1);
    expect(stats(values)).toEqual({ n: 50, p50: 25.5, p95: 48, max: 50 });
    expect(stats([])).toEqual({ n: 0, p50: null, p95: null, max: null });
  });

  it('applies the plan perf rule', () => {
    const within = perfVerdict({
      warmCatalogP95Ms: 300,
      firstAfterIdleMs: 2000,
      hostedSelectOneMedianMs: 2.137,
    });
    expect(within.pass).toBe(true);
    expect(within.predictedSyncWallMs).toBeCloseTo(985 + 2812 * 2, 6);
    expect(
      perfVerdict({
        warmCatalogP95Ms: 300.1,
        firstAfterIdleMs: 100,
        hostedSelectOneMedianMs: 1,
      }).checks,
    ).toMatchObject({ warmCatalogP95: false, firstAfterIdle: true });
    expect(
      perfVerdict({
        warmCatalogP95Ms: 100,
        firstAfterIdleMs: 2001,
        hostedSelectOneMedianMs: 1,
      }).pass,
    ).toBe(false);
    expect(
      perfVerdict({
        warmCatalogP95Ms: 100,
        firstAfterIdleMs: 100,
        hostedSelectOneMedianMs: 2.7,
      }).checks.predictedSyncWall,
    ).toBe(false);
    expect(
      perfVerdict({
        warmCatalogP95Ms: 100,
        firstAfterIdleMs: 100,
        hostedSelectOneMedianMs: null,
      }).pass,
    ).toBeNull();
  });

  it('tells public addresses from private ones', () => {
    for (const address of ['8.8.8.8', '192.0.2.44', '2001:db8::1'])
      expect(isPublicAddress(address)).toBe(true);
    for (const address of [
      '10.0.0.1',
      '172.20.1.1',
      '192.168.1.1',
      '127.0.0.1',
      '100.64.0.1',
      '::1',
      'fd00::1',
      'fe80::1',
      '8.8.8.8, 1.1.1.1',
      'unknown',
    ])
      expect(isPublicAddress(address)).toBe(false);
  });

  it('labels real addresses and keeps the forged ones readable', () => {
    const mask = addressMasker(['203.0.113.7']);
    expect(mask('203.0.113.7, 192.0.2.44')).toBe('203.0.113.7, addr-1');
    expect(mask('for=2001:db8::1;proto=https')).toBe('for=addr-2;proto=https');
    expect(mask('192.0.2.44')).toBe('addr-1');
    expect(mask(null)).toBeNull();
  });

  it('chooses only a header no client can forge', () => {
    const none = Object.fromEntries(
      clientAddressHeaders.map((name) => [name, null]),
    );
    const baseline = {
      ...none,
      'x-forwarded-for': realAddress,
      'cf-connecting-ip': realAddress,
    };
    const verdict = clientAddressVerdict(baseline, [
      {
        sent: { 'x-forwarded-for': '203.0.113.7' },
        received: {
          ...baseline,
          'x-forwarded-for': `203.0.113.7, ${realAddress}`,
        },
      },
      {
        sent: { 'x-real-ip': '203.0.113.8' },
        received: { ...baseline, 'x-real-ip': '203.0.113.8' },
      },
      { sent: { 'cf-connecting-ip': '203.0.113.9' }, received: null },
    ]);
    expect(verdict).toMatchObject({
      pass: true,
      chosen: 'cf-connecting-ip',
      candidates: ['cf-connecting-ip'],
      forgedRequestsRejected: 1,
      forwardedForLastElementUnchanged: true,
    });
    const passedThrough = clientAddressVerdict(baseline, [
      {
        sent: { 'cf-connecting-ip': '203.0.113.9' },
        received: { ...baseline, 'cf-connecting-ip': '203.0.113.9' },
      },
      {
        sent: { 'x-forwarded-for': '203.0.113.7' },
        received: { ...baseline, 'x-forwarded-for': '203.0.113.7' },
      },
    ]);
    expect(passedThrough).toMatchObject({
      pass: false,
      chosen: null,
      candidates: [],
      forwardedForLastElementUnchanged: false,
    });
    expect(
      clientAddressVerdict(
        baseline,
        [{ sent: { 'x-real-ip': '203.0.113.8' }, received: baseline }],
        '198.51.100.99',
      ).pass,
    ).toBe(false);
  });

  const burn = (
    requestedMs: number,
    workerId: string | null,
    workerAfterFailure: string | null = null,
  ): BurnStep => ({
    requestedMs,
    status: workerId ? 200 : 546,
    workerId,
    served: null,
    burnedMs: workerId ? requestedMs : null,
    workerAfterFailure,
  });

  it.each([
    [
      'per-request',
      [
        burn(700, 'a'),
        burn(700, 'a'),
        burn(700, 'a'),
        burn(700, 'a'),
        burn(1500, 'a'),
        burn(2500, null, 'b'),
      ],
    ],
    [
      'cumulative per worker',
      [
        burn(700, 'a'),
        burn(700, 'a'),
        burn(700, null, 'b'),
        burn(700, 'b'),
        burn(1500, null, 'c'),
        burn(2500, null, 'd'),
      ],
    ],
    [
      'Inconclusive',
      [
        burn(700, 'a'),
        burn(700, 'a'),
        burn(700, 'a'),
        burn(700, 'a'),
        burn(1500, 'a'),
        burn(2500, 'a'),
      ],
    ],
    [
      'Inconclusive',
      [
        burn(700, 'a'),
        burn(700, 'b'),
        burn(700, 'c'),
        burn(700, 'd'),
        burn(1500, 'e'),
        burn(2500, null, 'f'),
      ],
    ],
    ['Inconclusive', [burn(700, null, 'a'), burn(700, 'a')]],
    ['Inconclusive', []],
  ])('concludes %s from the burn pattern', (conclusion, steps) => {
    expect(cpuLimitConclusion(steps).conclusion).toBe(conclusion);
  });

  it('says when a per-worker limit is ruled out although nothing failed', () => {
    const result = cpuLimitConclusion([
      burn(700, 'a'),
      burn(700, 'a'),
      burn(700, 'a'),
      burn(700, 'a'),
      burn(1500, 'a'),
      burn(2500, 'a'),
    ]);
    expect(result).toMatchObject({
      cumulativeLimitRuledOut: true,
      maxCumulativeMsOnOneWorker: 6800,
      backToBackBurnsAllOk: true,
      workersReplaced: 0,
    });
  });

  it('pins a region only for a clear gain', () => {
    const run = (catalogP50Ms: number, region: string) => ({
      catalogP50Ms,
      regions: { [region]: 100 },
    });
    expect(
      regionDecision(
        run(120, 'us-east-1'),
        run(80, 'ca-central-1'),
        'ca-central-1',
      ).decision,
    ).toBe('pin ca-central-1');
    expect(
      regionDecision(
        run(85, 'us-east-1'),
        run(80, 'ca-central-1'),
        'ca-central-1',
      ).decision,
    ).toBe('do not pin');
    expect(
      regionDecision(
        run(120, 'ca-central-1'),
        run(80, 'ca-central-1'),
        'ca-central-1',
      ).decision,
    ).toBe('do not pin');
    expect(
      regionDecision(
        run(120, 'us-east-1'),
        run(80, 'us-east-1'),
        'ca-central-1',
      ).decision,
    ).toBe('do not pin');
    expect(
      regionDecision(
        { catalogP50Ms: 1, regions: {} },
        run(80, 'ca-central-1'),
        'ca-central-1',
      ).decision,
    ).toBeNull();
  });

  it('says go only when every lane and the perf rule are proven', () => {
    expect(decision([{ lane: 'lane 1', pass: true }])).toBe('Decision: go');
    expect(
      decision([
        { lane: 'lane 1', pass: true },
        { lane: 'lane 3', pass: false },
        { lane: 'lane 5', pass: null },
        { lane: 'perf rule', pass: false },
      ]),
    ).toBe('Decision: stop (failed: lane 3, perf rule; unproven: lane 5)');
  });
});

describe('hosted lanes against the trial entry', () => {
  const nonce = 'feedfacefeedface';

  /** Drives the lanes in process. `closes` names the requests the gateway drops unanswered. */
  async function drive(
    only?: readonly string[],
    closes: (route: string, bodyBytes: number) => boolean = () => false,
  ) {
    const { hosted } = trialHandler();
    const worker = fakeApi();
    const sent: {
      host: string;
      method: string;
      path: string;
      headers: string[];
    }[] = [];
    const receipts: Partial<Record<LaneId, Json>> = {};
    const slept: number[] = [];
    await runLanes(
      {
        functionUrl,
        workerUrl,
        trialKey,
        nonce,
        expectedSourceSha: sourceSha,
        macAddress: realAddress,
        idleMinutes: 15,
        warmRequests: 3,
        rounds: 3,
        burnsMs: [5, 5, 5, 5, 10, 15],
        send: async (url, init) => {
          const target = new URL(url);
          const headers = new Headers(init.headers);
          const onFunction = url.startsWith(functionUrl);
          sent.push({
            host: onFunction ? 'function' : target.origin,
            method: init.method ?? 'GET',
            path: onFunction
              ? target.pathname.slice(new URL(functionUrl).pathname.length)
              : target.pathname,
            headers: [...headers.keys()],
          });
          const route = `${init.method ?? 'GET'} ${target.pathname}`;
          if (
            closes(
              route,
              typeof init.body === 'string' ? Buffer.byteLength(init.body) : 0,
            )
          )
            throw new TypeError('fetch failed');
          if (!onFunction)
            return worker.handler.fetch(
              new Request(`${target.origin}/api${target.pathname}`),
            );
          // A gateway that overwrites one header, appends to another and passes the third through.
          headers.set('cf-connecting-ip', realAddress);
          headers.set(
            'x-forwarded-for',
            [headers.get('x-forwarded-for'), realAddress]
              .filter(Boolean)
              .join(', '),
          );
          const response = await hosted.fetch(
            new Request(url, {
              method: init.method ?? 'GET',
              headers,
              body: init.body ?? null,
            }),
          );
          const withRegion = new Response(response.body, response);
          withRegion.headers.set(
            'x-sb-edge-region',
            headers.get('x-region') ?? 'us-east-1',
          );
          return withRegion;
        },
        sleep: (ms) => {
          slept.push(ms);
          return Promise.resolve();
        },
        now: () => new Date('2026-11-09T12:00:00Z'),
        log: () => {},
        save: (lane, receipt) => {
          receipts[lane] = receipt;
          return Promise.resolve();
        },
        load: (lane) => Promise.resolve(receipts[lane]),
      },
      only,
    );
    return { receipts, sent, slept };
  }

  it('leaves lane 9 unproven when a body the API accepts gets no answer', async () => {
    const fourMebibytes = 4 * 1024 * 1024;
    const closedAbove = async (bytes: number) =>
      (
        await drive(
          ['9'],
          (route, bodyBytes) =>
            route.endsWith('/v1/journal-sync') && bodyBytes > bytes,
        )
      ).receipts['9'];
    expect(await closedAbove(fourMebibytes)).toMatchObject({
      pass: true,
      unanswered: [],
      rows: [
        { honoRoute: { outcome: 'reached' } },
        { honoRoute: { outcome: 'reached' } },
        { honoRoute: { outcome: 'connection closed', attempts: 2 } },
      ],
    });
    expect(await closedAbove(fourMebibytes - 1)).toMatchObject({
      pass: null,
      unanswered: [4],
    });
  });

  it('runs every lane without a write route, a leaked key or a real address', async () => {
    const { receipts, sent, slept } = await drive();

    expect(slept).toEqual([900_000, 900_000]);
    for (const lane of [
      '1',
      '2',
      '3',
      '4',
      '6',
      '7',
      '8',
      '9',
      'perf',
    ] as const)
      expect([lane, receipts[lane]?.pass]).toEqual([lane, true]);
    expect(receipts['3']).toMatchObject({ outcome: 'accepted' });
    expect(receipts['4']).toMatchObject({
      chosen: 'cf-connecting-ip',
      candidates: ['cf-connecting-ip'],
    });
    expect(receipts['7']).toMatchObject({
      unpinnedRegions: { 'us-east-1': 8 },
      pinnedRegions: { 'ca-central-1': 8 },
      regionDecision: 'do not pin',
    });
    expect(receipts['9']?.rows).toMatchObject([
      {
        honoRoute: { status: 401, outcome: 'reached' },
        trialRoute: { bytesCounted: 1024 * 1024 },
      },
      {
        honoRoute: { status: 401, outcome: 'reached' },
        trialRoute: { bytesCounted: 4 * 1024 * 1024 },
      },
      {
        honoRoute: { status: 413, outcome: 'reached' },
        trialRoute: { bytesCounted: 6 * 1024 * 1024 },
      },
    ]);
    expect(receipts.cpu).toMatchObject({
      conclusion: 'Inconclusive',
      backToBackBurnsAllOk: true,
      workersReplaced: 0,
    });
    expect(receipts['5']).toMatchObject({
      pass: null,
      nonce,
      window: {
        from: '2026-11-09T11:58:00.000Z',
        to: '2026-11-09T12:03:00.000Z',
      },
    });

    const saved = JSON.stringify(receipts);
    expect(saved).not.toContain(trialKey);
    expect(saved).not.toContain(realAddress);

    const allowed = new Set([
      'GET /health',
      'GET /ready',
      'GET /v1/access',
      'GET /v1/guest/challenges',
      'POST /v1/journal-sync',
      'GET /__trial/probe',
      'GET /__trial/burn',
      'POST /__trial/body',
      `GET /__canary/${canaryKinds.marker}${nonce}`,
    ]);
    for (const request of sent) {
      const route = `${request.method} ${request.path}`;
      expect(allowed.has(route) ? 'allowed' : route).toBe('allowed');
      expect([route, request.headers.includes(trialKeyHeader)]).toEqual([
        route,
        request.host === 'function' && request.path.startsWith('/__trial/'),
      ]);
      if (request.host !== 'function')
        expect([request.method, request.headers]).toEqual(['GET', []]);
    }

    const lane10 = deployReceipt({
      bundle: { sha256: 'b'.repeat(64) },
      functionsAfterDeploy: [
        {
          slug: 'justgo-trial',
          status: 'ACTIVE',
          version: 1,
          verify_jwt: false,
          ezbr_sha256: 'e'.repeat(64),
        },
      ],
      functionsAfterRepeat: [
        {
          slug: 'justgo-trial',
          status: 'ACTIVE',
          version: 1,
          verify_jwt: false,
          ezbr_sha256: 'e'.repeat(64),
        },
      ],
      secrets: [{ name: 'DATABASE_URL' }],
      repeatDeployLog: 'No change found in Function: justgo-trial',
      sourceSha,
      cliVersion: '3.1.0',
      runUrl: 'local',
      expectedSecretNames: ['DATABASE_URL'],
    });
    receipts['10'] = { ...lane10, summary: 'read back' };
    const pending = renderReport(receipts, 'now');
    expect(pending).toContain('Decision: stop (unproven: lane 5)');
    expect(pending.match(/^Decision:/gm)).toHaveLength(1);
    expect(pending).toContain('Client-address header: cf-connecting-ip.');
    expect(pending).toContain('Region decision: do not pin');
    expect(pending).toContain('CPU limit, beside the decision');

    const scan = await scanLogs(
      { ...(receipts['5']?.window as { from: string; to: string }), nonce },
      (sql) =>
        Promise.resolve({
          rows: sql.includes("'function_edge_logs'")
            ? [
                {
                  id: '1',
                  event_message: `/__canary/${canaryKinds.marker}${nonce}`,
                },
              ]
            : sql.includes("'function_logs'")
              ? [{ id: '2', event_message: 'incoming request' }]
              : [],
        }),
    );
    expect(
      logCanaryVerdict(receipts['5'] ?? {}, { ...scan, nonce: 'other' }),
    ).toMatchObject({ pass: null });
    receipts['5'] = {
      ...receipts['5'],
      ...logCanaryVerdict(receipts['5'] ?? {}, scan),
    };
    expect(renderReport(receipts, 'now')).toContain('\nDecision: go\n');
    expect(Object.keys(receipts).sort()).toEqual(
      Object.keys(receiptNames).sort(),
    );
  });
});
