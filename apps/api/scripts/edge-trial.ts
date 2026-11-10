import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { openSync, readFileSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';
import { Pool, type PoolClient } from 'pg';
import { localTestDatabaseUrl } from './local-test-database.js';

const run = promisify(execFile);
const root = resolve(import.meta.dirname, '../../..');
const out = resolve(root, '.local/edge-trial');
const image = required('EDGE_RUNTIME_IMAGE');
const sourceSha = (process.env.GITHUB_SHA ?? '').match(/^[a-f0-9]{40}$/)
  ? process.env.GITHUB_SHA!
  : 'f'.repeat(40);
const runUrl = process.env.GITHUB_RUN_ID
  ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}/attempts/${process.env.GITHUB_RUN_ATTEMPT ?? '1'}`
  : 'local';
const rounds = Number(process.env.EDGE_TRIAL_ROUNDS ?? '300');
if (!Number.isInteger(rounds) || rounds < 100 || rounds % 2)
  throw new Error('EDGE_TRIAL_ROUNDS must be an even integer of at least 100');
const warmupRounds = 10;
const warmupSmallRequests = 300;
const controlRounds = 100;
const profiledRounds = 20;
const profiledWarmupRounds = 5;
const seed = process.env.EDGE_TRIAL_SEED
  ? Number(process.env.EDGE_TRIAL_SEED) >>> 0
  : randomInt(2 ** 32);

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

const runtimeUrl = localTestDatabaseUrl(process.env.DATABASE_URL);
const adminUrl = localTestDatabaseUrl(
  process.env.JUSTGO_TEST_ADMIN_DATABASE_URL,
);
runtimeUrl.hostname = '127.0.0.1';
adminUrl.hostname = '127.0.0.1';
if (
  runtimeUrl.username !== 'justgo_runtime' ||
  adminUrl.username !== 'postgres' ||
  process.env.DATABASE_SSL !== 'disable'
)
  throw new Error('Edge trial needs the loopback runtime and admin roles');
const caPem = readFileSync(required('EDGE_TRIAL_DB_CA'), 'utf8');
const admin = new Pool({ connectionString: adminUrl.toString(), ssl: false });

const authOrigin = 'https://justgo-auth.trial.invalid';
const sentryOrigin = 'https://o1.ingest.us.sentry.io';
const publishableKey = `sb_publishable_${randomBytes(12).toString('hex')}`;
const authSecretKey = `sb_secret_${randomBytes(24).toString('hex')}`;
const rateKey = randomBytes(32).toString('hex');
const now = Date.now();
const betaWindow = JSON.stringify({
  startsAt: new Date(now - 3600_000).toISOString(),
  expiresAt: new Date(now + 6 * 3600_000).toISOString(),
});
const secrets = new Set<string>([publishableKey, authSecretKey, rateKey]);
const mask = (value: unknown) => {
  let text = JSON.stringify(value, null, 2);
  for (const secret of secrets) text = text.split(secret).join('<masked>');
  return text;
};

const authTokens = new Map<string, string>();
const authCalls = { ok: 0, rejected: 0, wrongKey: 0 };
const envelopes: { receivedAt: string; text: string }[] = [];

function listen(server: Server) {
  return new Promise<number>((resolveListen) =>
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolveListen(typeof address === 'object' && address ? address.port : 0);
    }),
  );
}

const authStub = createServer((request, response) => {
  const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
  const authUserId = authTokens.get(token);
  if (request.headers.apikey !== publishableKey) authCalls.wrongKey++;
  if (
    request.method !== 'GET' ||
    request.url !== '/auth/v1/user' ||
    !authUserId ||
    request.headers.apikey !== publishableKey
  ) {
    authCalls.rejected++;
    response.writeHead(401, { 'content-type': 'application/json' });
    response.end('{"code":401}');
    return;
  }
  authCalls.ok++;
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      id: authUserId,
      aud: 'authenticated',
      identities: [{ provider: 'apple' }],
    }),
  );
});

const sentryStub = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => chunks.push(chunk));
  request.on('end', () => {
    envelopes.push({
      receivedAt: new Date().toISOString(),
      text: Buffer.concat(chunks).toString('utf8'),
    });
    response.writeHead(200);
    response.end();
  });
});

type Env = Record<string, string>;
let fetchMap = '';

function baseEnv(): Env {
  return {
    NODE_ENV: 'production',
    APP_ENVIRONMENT: 'staging',
    JUSTGO_SOURCE_SHA: sourceSha,
    DATABASE_URL: runtimeUrl.toString(),
    DATABASE_SSL: 'disable',
    LOG_LEVEL: 'silent',
    IDENTITY_RATE_LIMIT_KEY: rateKey,
    BETA_ACCESS_WINDOW: betaWindow,
    ACTIVITY_WRITE_RATE_LIMIT: '10000',
    ACCOUNT_EXPORT_RATE_LIMIT: '10000',
    API_SENTRY_ENABLED: 'true',
    API_SENTRY_DSN: `https://${'c'.repeat(32)}@o1.ingest.us.sentry.io/1`,
    API_SENTRY_RELEASE: sourceSha,
    JUSTGO_EDGE_TRIAL_FETCH_MAP: fetchMap,
  };
}
const managedNodeEnv = (): Env => ({
  ...baseEnv(),
  MANAGED_AUTH_ENABLED: 'true',
  SUPABASE_URL: authOrigin,
  SUPABASE_PUBLISHABLE_KEY: publishableKey,
  SUPABASE_AUTH_SECRET_KEY: authSecretKey,
});
const managedEdgeEnv = (): Env => ({
  ...baseEnv(),
  JUSTGO_EDGE_TRIAL: 'on',
  MANAGED_AUTH_ENABLED: 'true',
  SUPABASE_URL: authOrigin,
  JUSTGO_AUTH_PUBLISHABLE_KEY: publishableKey,
  JUSTGO_AUTH_SECRET_KEY: authSecretKey,
});
const legacyEnv = (): Env => ({
  ...baseEnv(),
  MANAGED_AUTH_ENABLED: 'false',
  DATABASE_POOL_MAX: '2',
});
const legacyEdgeEnv = (): Env => ({ ...legacyEnv(), JUSTGO_EDGE_TRIAL: 'on' });
const tlsEdgeEnv = (): Env => {
  const url = new URL(runtimeUrl);
  url.hostname = 'localhost';
  return {
    ...managedEdgeEnv(),
    DATABASE_URL: url.toString(),
    DATABASE_SSL: 'verify-full',
    DATABASE_CA_CERT: caPem,
  };
};

type BundleKind = 'bundled' | 'npm-pg' | 'npm-pg-buffer';
const kinds: BundleKind[] = ['bundled', 'npm-pg', 'npm-pg-buffer'];
const banners: Record<BundleKind, string> = {
  bundled: [
    "import { createRequire as __trialCreateRequire } from 'node:module';",
    "import { Buffer } from 'node:buffer';",
    "import process from 'node:process';",
    "import { setImmediate, clearImmediate } from 'node:timers';",
    'const require = __trialCreateRequire(import.meta.url);',
    'const global = globalThis;',
  ].join('\n'),
  'npm-pg': [
    "import { createRequire as __trialCreateRequire } from 'node:module';",
    'const require = __trialCreateRequire(import.meta.url);',
  ].join('\n'),
  'npm-pg-buffer': [
    "import { createRequire as __trialCreateRequire } from 'node:module';",
    "import { Buffer } from 'node:buffer';",
    'const require = __trialCreateRequire(import.meta.url);',
  ].join('\n'),
};

async function bundle(entry: string, outfile: string, kind: BundleKind) {
  const result = await build({
    entryPoints: [resolve(root, entry)],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'es2022',
    metafile: true,
    logLevel: 'error',
    banner: { js: banners[kind] },
    external:
      kind !== 'bundled'
        ? ['pg', 'pg-native', 'pg-cloudflare']
        : ['pg-native', 'pg-cloudflare'],
    alias: {
      '@justgo/contracts': resolve(root, 'packages/contracts/src/index.ts'),
      '@justgo/contracts/openapi': resolve(
        root,
        'packages/contracts/src/openapi.ts',
      ),
    },
  });
  const bytes = (await readFile(outfile)).byteLength;
  const sha256 = createHash('sha256')
    .update(await readFile(outfile))
    .digest('hex');
  const externals = new Set<string>();
  for (const output of Object.values(result.metafile.outputs))
    for (const item of output.imports)
      if (item.external) externals.add(item.path);
  return { entry, kind, bytes, sha256, externals: [...externals].sort() };
}

async function buildFunctions() {
  const results = [];
  for (const kind of kinds) {
    const dir = resolve(out, 'functions', kind);
    await mkdir(resolve(dir, 'dist'), { recursive: true });
    await cp(
      resolve(root, 'supabase/functions/api/index.ts'),
      `${dir}/index.ts`,
    );
    await cp(
      resolve(root, 'supabase/functions/api/deno.json'),
      `${dir}/deno.json`,
    );
    results.push(
      await bundle(
        'apps/api/src/edge.ts',
        resolve(out, 'build', kind, 'edge.production.mjs'),
        kind,
      ),
    );
    results.push(
      await bundle(
        'apps/api/scripts/edge-trial/function.ts',
        `${dir}/dist/edge.mjs`,
        kind,
      ),
    );
  }
  return results;
}

const children: ChildProcess[] = [];
const containers: string[] = [];

async function startNode(
  name: string,
  port: number,
  env: Env,
  inspectPort?: number,
) {
  const log = openSync(resolve(out, 'logs', `${name}.log`), 'w');
  const child = spawn(
    process.execPath,
    [
      ...(inspectPort ? [`--inspect=127.0.0.1:${inspectPort}`] : []),
      '--import',
      'tsx',
      '--import',
      pathToFileURL(
        resolve(root, 'apps/api/scripts/edge-trial/node-preload.ts'),
      ).href,
      resolve(root, 'apps/api/src/server.ts'),
    ],
    {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        ...env,
        PORT: String(port),
      },
      stdio: ['ignore', log, log],
    },
  );
  children.push(child);
  const entry: Entry = {
    name,
    origin: `http://127.0.0.1:${port}`,
    prefix: '',
    headers: {},
    pid: child.pid,
  };
  await waitFor(entry, '/health');
  return entry;
}

type Variant = {
  name: string;
  functionDir: string;
  importMap?: string | undefined;
  env: Env;
  cpuSoftMs: number;
  cpuHardMs: number;
  memoryMb: number;
  wallMs: number;
};
const cliLimits = {
  cpuSoftMs: 1000,
  cpuHardMs: 2000,
  memoryMb: 256,
  wallMs: 150_000,
};
const noLimits = {
  cpuSoftMs: 0,
  cpuHardMs: 0,
  memoryMb: 256,
  wallMs: 3_600_000,
};
const functionDir = (kind: BundleKind) =>
  `/repo/.local/edge-trial/functions/${kind}`;
const importMap = (kind: BundleKind) =>
  kind === 'bundled' ? undefined : `${functionDir(kind)}/deno.json`;

async function startEdge(
  name: string,
  port: number,
  policy: 'per_worker' | 'per_request',
  variants: Variant[],
  inspectPort?: number,
) {
  await run('docker', ['rm', '-f', name]).catch(() => undefined);
  await run('docker', [
    'run',
    '-d',
    '--name',
    name,
    '--network',
    'host',
    '-v',
    `${root}:/repo`,
    '-w',
    '/repo',
    '-e',
    `EDGE_TRIAL_VARIANTS=${JSON.stringify(variants)}`,
    image,
    'start',
    '--main-service',
    '/repo/apps/api/scripts/edge-trial/main',
    '--ip',
    '127.0.0.1',
    '--port',
    String(port),
    '--policy',
    policy,
    ...(inspectPort ? [`--inspect=127.0.0.1:${inspectPort}`] : []),
  ]);
  containers.push(name);
  const pid = Number(
    (
      await run('docker', ['inspect', '-f', '{{.State.Pid}}', name])
    ).stdout.trim(),
  );
  const origin = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${origin}/_internal/health`)).ok) break;
    } catch {
      /* the runtime is still starting */
    }
    await delay(250);
  }
  return { name, origin, pid };
}

async function stopEdge(name: string) {
  const logs = await run('docker', ['logs', name], {
    maxBuffer: 64 * 1024 * 1024,
  }).catch((error: { stdout?: string; stderr?: string }) => error);
  await writeFile(
    resolve(out, 'logs', `${name}.log`),
    `${logs.stdout ?? ''}${logs.stderr ?? ''}`,
  );
  await run('docker', ['rm', '-f', name]).catch(() => undefined);
}

type Entry = {
  name: string;
  origin: string;
  prefix: string;
  headers: Record<string, string>;
  pid?: number | undefined;
};
type Reply = {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  text: string;
  wallMs: number;
  bytesSent: number;
};

async function call(
  entry: Entry,
  method: string,
  path: string,
  options: {
    token?: string;
    body?: unknown;
    raw?: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
  } = {},
): Promise<Reply> {
  const payload =
    options.raw ??
    (options.body === undefined ? undefined : JSON.stringify(options.body));
  const start = performance.now();
  const response = await fetch(entry.origin + entry.prefix + path, {
    method,
    headers: {
      ...entry.headers,
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      ...options.headers,
    },
    ...(payload === undefined ? {} : { body: payload }),
    redirect: 'manual',
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  });
  const text = await response.text();
  const wallMs = performance.now() - start;
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep the text */
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body,
    text,
    wallMs,
    bytesSent: payload === undefined ? 0 : Buffer.byteLength(payload),
  };
}

async function waitFor(entry: Entry, path: string, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last: Reply | string = 'no reply';
  while (Date.now() < deadline) {
    try {
      last = await call(entry, 'GET', path, { timeoutMs: 15_000 });
      if (last.status === 200) return last;
    } catch (error) {
      last = error instanceof Error ? error.message : 'error';
    }
    await delay(500);
  }
  throw new Error(
    `${entry.name} ${path} never returned 200: ${typeof last === 'string' ? last : `${last.status} ${last.text.slice(0, 300)}`}`,
  );
}

type ManagedUser = {
  authUserId: string;
  sessionId: string;
  deviceId: string;
  token: string;
  userId: string;
  dataEpoch: number;
};
type Card = { challengeId: string; venue: string; instruction: string };

function mintToken(authUserId: string, sessionId: string) {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = [
    encode({ alg: 'ES256', typ: 'JWT' }),
    encode({
      sub: authUserId,
      session_id: sessionId,
      exp: Math.floor(now / 1000) + 6 * 3600,
      role: 'authenticated',
      aud: 'authenticated',
      iss: `${authOrigin}/auth/v1`,
    }),
    randomBytes(32).toString('base64url'),
  ].join('.');
  authTokens.set(token, authUserId);
  secrets.add(token);
  return token;
}

async function managedIdentity() {
  const authUserId = randomUUID();
  const sessionId = randomUUID();
  await admin.query('insert into auth.sessions(id,user_id) values($1,$2)', [
    sessionId,
    authUserId,
  ]);
  return {
    authUserId,
    sessionId,
    deviceId: randomUUID(),
    token: mintToken(authUserId, sessionId),
  };
}

async function exchange(
  entry: Entry,
  identity: Awaited<ReturnType<typeof managedIdentity>>,
): Promise<ManagedUser> {
  const reply = await call(entry, 'POST', '/v1/auth/session', {
    token: identity.token,
    body: { deviceId: identity.deviceId },
  });
  if (reply.status !== 200)
    throw new Error(
      `${entry.name} exchange returned ${reply.status} ${reply.text.slice(0, 200)}`,
    );
  const body = reply.body as { userId: string; dataEpoch: number };
  return { ...identity, userId: body.userId, dataEpoch: body.dataEpoch };
}

async function managedUser(entry: Entry) {
  return exchange(entry, await managedIdentity());
}

async function deleteUser(userId: string) {
  for (const table of [
    'attempt_patch_receipts',
    'journal_versions',
    'deleted_completion_ids',
    'attempts',
    'managed_auth_sessions',
    'managed_auth_accounts',
    'managed_auth_deletions',
    'device_transfers',
    'device_sessions',
    'recovery_credentials',
    'devices',
  ])
    await admin
      .query(`delete from justgo.${table} where user_id=$1`, [userId])
      .catch(() => undefined);
  await admin.query('delete from justgo.users where id=$1', [userId]);
}

async function prepareDatabase() {
  for (const role of ['anon', 'authenticated', 'service_role'])
    if (
      !(await admin.query('select 1 from pg_roles where rolname=$1', [role]))
        .rowCount
    )
      await admin.query(`create role ${role} nologin`);
  await admin.query(`create schema if not exists auth authorization postgres;
    create table if not exists auth.sessions (
      id uuid primary key, user_id uuid not null, not_after timestamptz
    );`);
  await admin.query(
    readFileSync(
      resolve(root, 'apps/api/scripts/managed-auth/session-check-v1.sql'),
      'utf8',
    ),
  );
}

let card: Card;
async function loadCard() {
  const row = (
    await admin.query<Card>(
      `select c.id as "challengeId", v.venue_id as venue, c.text as instruction
       from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id
       where v.active and c.active and c.level_id='level-1'
       order by v.venue_id, v.position, v.id limit 1`,
    )
  ).rows[0];
  if (!row) throw new Error('No seeded challenge card');
  return row;
}

function attemptInput(user: ManagedUser, startedAt: Date, id = randomUUID()) {
  return {
    id,
    challengeId: card.challengeId,
    venue: card.venue,
    startedAt: startedAt.toISOString(),
    startTimeZone: 'UTC',
    expectedEpoch: user.dataEpoch,
  };
}

function context(attemptId: string, startedAt: Date, instruction: string) {
  const iso = startedAt.toISOString();
  return {
    id: attemptId,
    challengeId: card.challengeId,
    venue: card.venue,
    levelId: 'level-1',
    instruction,
    startedAt: iso,
    startTimeZone: 'UTC',
    displayTimeZone: 'UTC',
    activityDate: iso.slice(0, 10),
  };
}

function version(
  attemptId: string,
  startedAt: Date,
  parents: string[],
  text: string,
  instruction = 'Synthetic trial instruction',
) {
  return {
    versionId: randomUUID(),
    attemptId,
    parents,
    feelingScaleVersion: 1,
    reflection: { feeling: 'a_little_better', text, revision: 1 },
    context: context(attemptId, startedAt, instruction),
  };
}

const maxBody = 4 * 1024 * 1024;
const worstTarget = maxBody - 40_000;
const syncStart = new Date(now - 2 * 3600_000);

const versionsPerBatch = 50;
const maxTextLength = 10_000;
const paddedFields = versionsPerBatch * 2;
const extraBytesPerEscapedCharacter = '\\u0001'.length - Buffer.byteLength('€');

function worstBatch(user: ManagedUser, attemptId: string, parents: string[]) {
  const make = (escaped: number) => {
    const field =
      '\u0001'.repeat(escaped) + '€'.repeat(maxTextLength - escaped);
    return {
      expectedEpoch: user.dataEpoch,
      versions: Array.from({ length: versionsPerBatch }, () =>
        version(attemptId, syncStart, parents, field, field),
      ),
    };
  };
  const base = Buffer.byteLength(JSON.stringify(make(0)));
  const escaped = Math.min(
    maxTextLength,
    Math.max(
      0,
      Math.floor(
        (worstTarget - base) / (extraBytesPerEscapedCharacter * paddedFields),
      ),
    ),
  );
  const batch = make(escaped);
  const raw = JSON.stringify(batch);
  if (Buffer.byteLength(raw) > maxBody) throw new Error('worst batch too big');
  return { raw, bytes: Buffer.byteLength(raw), escapedPerField: escaped };
}

async function seedParents(entry: Entry, user: ManagedUser) {
  const attemptId = randomUUID();
  const seeds = Array.from({ length: 50 }, () =>
    version(attemptId, syncStart, [], 'seed'),
  );
  const reply = await call(entry, 'POST', '/v1/journal-sync', {
    token: user.token,
    body: { expectedEpoch: user.dataEpoch, versions: seeds },
  });
  if (reply.status !== 200)
    throw new Error(
      `${entry.name} seed sync ${reply.status} ${reply.text.slice(0, 200)}`,
    );
  return { attemptId, parents: seeds.map((seed) => seed.versionId) };
}

type LaneResult = {
  lane: number;
  slug: string;
  pass: boolean;
  summary: string;
};
const laneResults: Record<string, LaneResult[]> = {};

async function lane(
  group: string,
  lane: number,
  slug: string,
  work: () => Promise<{ pass: boolean; summary: string; receipt: unknown }>,
) {
  let result: { pass: boolean; summary: string; receipt: unknown };
  try {
    result = await work();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result = {
      pass: false,
      summary: `error: ${message}`,
      receipt: { error: message },
    };
  }
  const dir = resolve(out, 'receipts', group);
  await mkdir(dir, { recursive: true });
  await writeFile(
    resolve(dir, slug),
    mask({
      lane,
      pass: result.pass,
      summary: result.summary,
      receipt: result.receipt,
    }),
  );
  (laneResults[group] ??= []).push({
    lane,
    slug,
    pass: result.pass,
    summary: result.summary,
  });
  console.info(
    `[${group}] lane ${lane} ${result.pass ? 'pass' : 'FAIL'}: ${result.summary}`,
  );
}

const today = () => new Date().toISOString().slice(0, 10);

function normalize(value: unknown, userId?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => normalize(item, userId));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === 'requestId'
          ? '<request-id>'
          : key === 'checkedAt'
            ? '<server-time>'
            : normalize(item, userId),
      ]),
    );
  return userId !== undefined && value === userId ? '<user-id>' : value;
}

async function routeSequence(
  entry: Entry,
  identity: Awaited<ReturnType<typeof managedIdentity>>,
  ids: { attempt: string; version: string; startedAt: Date },
) {
  const steps: {
    step: string;
    status: number;
    body: unknown;
    headers: Record<string, string | undefined>;
  }[] = [];
  let userId = '';
  const record = (step: string, reply: Reply) =>
    steps.push({
      step,
      status: reply.status,
      body: reply.body,
      headers: {
        'cache-control': reply.headers['cache-control'],
        'content-type': reply.headers['content-type'],
        'x-justgo-source-sha': reply.headers['x-justgo-source-sha'],
        'x-justgo-environment': reply.headers['x-justgo-environment'],
      },
    });
  record('GET /health', await call(entry, 'GET', '/health'));
  record('GET /ready', await call(entry, 'GET', '/ready'));
  record(
    'GET /v1/guest/challenges',
    await call(entry, 'GET', '/v1/guest/challenges'),
  );
  const exchanged = await call(entry, 'POST', '/v1/auth/session', {
    token: identity.token,
    body: { deviceId: identity.deviceId },
  });
  record('POST /v1/auth/session', exchanged);
  const session = exchanged.body as { userId: string; dataEpoch: number };
  userId = session.userId;
  const token = identity.token;
  record(
    'GET /v1/auth/session',
    await call(entry, 'GET', '/v1/auth/session', { token }),
  );
  record(
    'GET /v1/challenges',
    await call(entry, 'GET', '/v1/challenges', { token }),
  );
  const input = {
    id: ids.attempt,
    challengeId: card.challengeId,
    venue: card.venue,
    startedAt: ids.startedAt.toISOString(),
    startTimeZone: 'UTC',
    expectedEpoch: session.dataEpoch,
  };
  record(
    'POST /v1/attempts',
    await call(entry, 'POST', '/v1/attempts', { token, body: input }),
  );
  record(
    'POST /v1/attempts retry',
    await call(entry, 'POST', '/v1/attempts', { token, body: input }),
  );
  const date = ids.startedAt.toISOString().slice(0, 10);
  record(
    'GET /v1/attempts?date',
    await call(entry, 'GET', `/v1/attempts?date=${date}`, { token }),
  );
  record(
    'POST /v1/journal-sync',
    await call(entry, 'POST', '/v1/journal-sync', {
      token,
      body: {
        expectedEpoch: session.dataEpoch,
        versions: [
          {
            versionId: ids.version,
            attemptId: ids.attempt,
            parents: [],
            feelingScaleVersion: 1,
            reflection: {
              feeling: 'a_little_better',
              text: 'synthetic',
              revision: 1,
            },
          },
        ],
      },
    }),
  );
  record(
    'GET /v1/journal-sync',
    await call(entry, 'GET', '/v1/journal-sync', { token }),
  );
  record(
    'GET /v1/progress/summary',
    await call(entry, 'GET', '/v1/progress/summary?timeZone=UTC', { token }),
  );
  record(
    'GET /v1/challenges without bearer',
    await call(entry, 'GET', '/v1/challenges'),
  );
  record('GET /v1/missing', await call(entry, 'GET', '/v1/missing'));
  const readback = (
    await admin.query<{ attempts: number; versions: number }>(
      `select (select count(*)::int from justgo.attempts where user_id=$1) as attempts,
              (select count(*)::int from justgo.journal_versions where user_id=$1) as versions`,
      [userId],
    )
  ).rows[0];
  return { steps, userId, readback };
}

async function lanes(
  group: BundleKind,
  edgeOrigin: string,
  nodeManaged: Entry,
  nodeLegacy: Entry,
) {
  const edge: Entry = {
    name: `edge-${group}`,
    origin: edgeOrigin,
    prefix: '/api',
    headers: { 'x-edge-trial-variant': `${group}-managed` },
  };
  const edgeLegacy: Entry = {
    ...edge,
    name: `edge-${group}-legacy`,
    headers: { 'x-edge-trial-variant': `${group}-legacy2` },
  };
  const edgeTls: Entry = {
    ...edge,
    name: `edge-${group}-tls`,
    headers: { 'x-edge-trial-variant': `${group}-tls` },
  };
  const coldStart = performance.now();
  const boot = await waitFor(edge, '/health', 90_000);
  const coldHealthMs = performance.now() - coldStart;
  const warmHealthMs = (await call(edge, 'GET', '/health')).wallMs;
  await waitFor(edgeLegacy, '/health', 90_000);
  const runtime = await call(edge, 'GET', '/__trial/runtime');

  await lane(group, 1, 'route-sequence.json', async () => {
    const identity = await managedIdentity();
    const ids = {
      attempt: randomUUID(),
      version: randomUUID(),
      startedAt: new Date(now - 600_000),
    };
    const node = await routeSequence(nodeManaged, identity, ids);
    await deleteUser(node.userId);
    const head = await routeSequence(edge, identity, ids);
    const left = normalize(
      node.steps.map(({ step, status, body }) => ({ step, status, body })),
      node.userId,
    );
    const right = normalize(
      head.steps.map(({ step, status, body }) => ({ step, status, body })),
      head.userId,
    );
    const mismatches = (left as { step: string }[]).flatMap((step, index) =>
      JSON.stringify(step) === JSON.stringify((right as unknown[])[index])
        ? []
        : [step.step],
    );
    const readbackSame =
      JSON.stringify(node.readback) === JSON.stringify(head.readback);
    return {
      pass:
        mismatches.length === 0 &&
        readbackSame &&
        node.steps.length === head.steps.length,
      summary: `${node.steps.length} steps, ${mismatches.length} mismatches${mismatches.length ? ` (${mismatches.join(', ')})` : ''}, readback node ${JSON.stringify(node.readback)} edge ${JSON.stringify(head.readback)}`,
      receipt: {
        normalized: [
          'requestId values',
          'checkedAt values',
          'the server-allocated userId',
        ],
        trunkNode: { steps: node.steps, readback: node.readback },
        headEdge: { steps: head.steps, readback: head.readback },
        mismatches,
      },
    };
  });

  await lane(group, 2, 'ready.json', async () => {
    const health = await call(edge, 'GET', '/health');
    const ready = await call(edge, 'GET', '/ready');
    await admin.query(
      'revoke execute on function justgo_auth_private.is_live_session_v1(uuid,uuid) from justgo_runtime',
    );
    let withoutHelper: Reply;
    try {
      withoutHelper = await call(edge, 'GET', '/ready');
    } finally {
      await admin.query(
        'grant execute on function justgo_auth_private.is_live_session_v1(uuid,uuid) to justgo_runtime',
      );
    }
    const restored = await call(edge, 'GET', '/ready');
    const sessions = (
      await admin.query(
        `select usename, application_name, state from pg_stat_activity
         where usename='justgo_runtime' order by backend_start`,
      )
    ).rows;
    return {
      pass:
        health.status === 200 &&
        ready.status === 200 &&
        withoutHelper.status === 503 &&
        restored.status === 200,
      summary: `health ${health.status}, ready ${ready.status}, ready without helper grant ${withoutHelper.status}, restored ${restored.status}`,
      receipt: {
        health,
        ready,
        withoutHelper,
        restored,
        runtimeConnections: sessions,
      },
    };
  });

  await lane(group, 3, 'guest-catalog.json', async () => {
    const reply = await call(edge, 'GET', '/v1/guest/challenges');
    const seeded = (
      await admin.query<{ id: string }>(
        `select v.id from justgo.venue_cards v join justgo.challenges c on c.id=v.challenge_id
         where v.active and c.active and c.level_id='level-1' order by v.venue_id,v.position,v.id`,
      )
    ).rows.map((row) => row.id);
    const cards = (
      (reply.body as { cards?: { id: string }[] }).cards ?? []
    ).map((item) => item.id);
    return {
      pass:
        reply.status === 200 &&
        cards.length > 0 &&
        JSON.stringify(cards) === JSON.stringify(seeded),
      summary: `status ${reply.status}, ${cards.length} cards, seeded ${seeded.length}`,
      receipt: { status: reply.status, cards, seeded },
    };
  });

  await lane(group, 4, 'owner-isolation.json', async () => {
    const a = await managedUser(edge);
    const b = await managedUser(edge);
    const writes: { owner: 'a' | 'b'; id: string; status: number }[] = [];
    for (let pair = 0; pair < 10; pair++) {
      const inputs = [
        {
          owner: 'a' as const,
          user: a,
          input: attemptInput(a, new Date(now - (pair * 2 + 1) * 1000)),
        },
        {
          owner: 'b' as const,
          user: b,
          input: attemptInput(b, new Date(now - (pair * 2 + 2) * 1000)),
        },
      ];
      const replies = await Promise.all(
        inputs.map((item) =>
          call(edge, 'POST', '/v1/attempts', {
            token: item.user.token,
            body: item.input,
          }),
        ),
      );
      inputs.forEach((item, index) =>
        writes.push({
          owner: item.owner,
          id: item.input.id,
          status: replies[index]!.status,
        }),
      );
    }
    const readOwn = async (user: ManagedUser) =>
      (
        (
          await call(edge, 'GET', `/v1/attempts?date=${today()}&limit=50`, {
            token: user.token,
          })
        ).body as { entries?: { id: string }[] }
      ).entries?.map((entry) => entry.id) ?? [];
    const apiA = await readOwn(a);
    const apiB = await readOwn(b);
    const rows = (
      await admin.query<{ id: string; user_id: string }>(
        'select id, user_id from justgo.attempts where id = any($1::uuid[])',
        [writes.map((write) => write.id)],
      )
    ).rows;
    const expected = new Map(
      writes.map((write) => [
        write.id,
        write.owner === 'a' ? a.userId : b.userId,
      ]),
    );
    const crossOwnerRows = rows.filter(
      (row) => expected.get(row.id) !== row.user_id,
    );
    const idsA = writes
      .filter((w) => w.owner === 'a')
      .map((w) => w.id)
      .sort();
    const idsB = writes
      .filter((w) => w.owner === 'b')
      .map((w) => w.id)
      .sort();
    const pass =
      writes.every((write) => write.status === 201) &&
      JSON.stringify([...apiA].sort()) === JSON.stringify(idsA) &&
      JSON.stringify([...apiB].sort()) === JSON.stringify(idsB) &&
      rows.length === 20 &&
      crossOwnerRows.length === 0;
    return {
      pass,
      summary: `${writes.filter((w) => w.status === 201).length}/20 created, A reads ${apiA.length}, B reads ${apiB.length}, ${rows.length} rows, ${crossOwnerRows.length} cross-owner rows`,
      receipt: {
        writes,
        apiA,
        apiB,
        sqlRows: rows,
        crossOwnerRows,
        owners: { a: a.userId, b: b.userId },
      },
    };
  });

  await lane(group, 5, 'cross-account.json', async () => {
    const probe = async (entry: Entry) => {
      const a = await managedUser(entry);
      const b = await managedUser(entry);
      const startedAt = new Date(now - 300_000);
      const attempt = attemptInput(b, startedAt);
      const written = await call(entry, 'POST', '/v1/attempts', {
        token: b.token,
        body: attempt,
      });
      const synced = await call(entry, 'POST', '/v1/journal-sync', {
        token: b.token,
        body: {
          expectedEpoch: b.dataEpoch,
          versions: [
            {
              versionId: randomUUID(),
              attemptId: attempt.id,
              parents: [],
              feelingScaleVersion: 1,
              reflection: {
                feeling: null,
                text: 'second user private text',
                revision: 1,
              },
            },
          ],
        },
      });
      const snapshot = async () =>
        (
          await admin.query(
            `select (select json_agg(a order by a.id) from justgo.attempts a where a.user_id=$1) as attempts,
                    (select json_agg(v order by v.version_id) from justgo.journal_versions v where v.user_id=$1) as versions,
                    (select count(*)::int from justgo.attempts) as all_attempts,
                    (select count(*)::int from justgo.journal_versions) as all_versions`,
            [b.userId],
          )
        ).rows[0];
      const before = await snapshot();
      const date = startedAt.toISOString().slice(0, 10);
      const list = await call(
        entry,
        'GET',
        `/v1/attempts?date=${date}&limit=50`,
        { token: a.token },
      );
      const journal = await call(entry, 'GET', '/v1/journal-sync', {
        token: a.token,
      });
      const patch = await call(entry, 'PATCH', `/v1/attempts/${attempt.id}`, {
        token: a.token,
        body: {
          submissionId: randomUUID(),
          expectedReflectionRevision: 0,
          reflection: { text: 'cross-account write' },
        },
      });
      const after = await snapshot();
      const leaked =
        list.text.includes(attempt.id) ||
        journal.text.includes(attempt.id) ||
        patch.text.includes(attempt.id);
      return {
        setup: [written.status, synced.status],
        statuses: [list.status, journal.status, patch.status],
        bodies: [list.body, journal.body, patch.body],
        leaked,
        unchanged: JSON.stringify(before) === JSON.stringify(after),
      };
    };
    const node = await probe(nodeManaged);
    const head = await probe(edge);
    return {
      pass:
        JSON.stringify(node.statuses) === JSON.stringify(head.statuses) &&
        !head.leaked &&
        head.unchanged &&
        head.setup.every((status) => status === 201 || status === 200),
      summary: `edge statuses ${head.statuses.join('/')}, node ${node.statuses.join('/')}, leaked ${head.leaked}, rows unchanged ${head.unchanged}`,
      receipt: { trunkNode: node, headEdge: head },
    };
  });

  await lane(group, 6, 'rollback.json', async () => {
    const user = await managedUser(edge);
    const input = attemptInput(user, new Date(now - 120_000));
    const bucketsBefore = (
      await admin.query(
        'select key, count from justgo.identity_rate_buckets order by key',
      )
    ).rows;
    const failed = await call(edge, 'POST', '/v1/attempts', {
      token: user.token,
      body: input,
      headers: { 'x-justgo-trial-failpoint': 'after-insert' },
    });
    const rows = (
      await admin.query('select id from justgo.attempts where user_id=$1', [
        user.userId,
      ])
    ).rows;
    const bucketsAfter = (
      await admin.query(
        'select key, count from justgo.identity_rate_buckets order by key',
      )
    ).rows;
    const ready = await call(edge, 'GET', '/ready');
    const retry = await call(edge, 'POST', '/v1/attempts', {
      token: user.token,
      body: input,
    });
    const body = failed.body as { code?: string; requestId?: string };
    return {
      pass:
        failed.status === 503 &&
        body.code === 'UNAVAILABLE' &&
        body.requestId === failed.headers['x-request-id'] &&
        Object.keys(body).length === 2 &&
        rows.length === 0 &&
        ready.status === 200 &&
        retry.status === 201,
      summary: `failpoint ${failed.status} ${JSON.stringify(normalize(body))}, rows after ${rows.length}, ready ${ready.status}, clean retry ${retry.status}`,
      receipt: {
        failed,
        rowsAfterFailure: rows,
        rateBucketsUnchanged:
          JSON.stringify(bucketsBefore) === JSON.stringify(bucketsAfter),
        ready: ready.status,
        retry,
      },
    };
  });

  await lane(group, 7, 'xact-locks.json', async () => {
    const contend = async (entry: Entry) => {
      const sessionToken = randomBytes(32).toString('hex');
      secrets.add(sessionToken);
      const session = await call(entry, 'POST', '/v1/sessions', {
        body: {
          kind: 'bootstrap',
          deviceId: randomUUID(),
          sessionId: randomUUID(),
          sessionToken,
          credential: randomBytes(32).toString('hex'),
        },
      });
      const code = randomBytes(8).toString('hex').toUpperCase();
      const codeDigest = createHash('sha256').update(code).digest('hex');
      const transfer = () => ({
        id: randomUUID(),
        code,
        claimSecret: randomBytes(32).toString('hex'),
        deviceId: randomUUID(),
        sessionId: randomUUID(),
        sessionToken: randomBytes(32).toString('hex'),
        credential: randomBytes(32).toString('hex'),
      });
      const holder: PoolClient = await admin.connect();
      const waits: unknown[] = [];
      let replies: Reply[] = [];
      try {
        await holder.query('begin');
        await holder.query(
          'select pg_advisory_xact_lock(hashtextextended($1,1))',
          [codeDigest],
        );
        const pending = [transfer(), transfer()].map((body) =>
          call(entry, 'POST', '/v1/transfers', { body }),
        );
        let waiting = 0;
        const deadline = Date.now() + 4000;
        while (Date.now() < deadline && waiting < 2) {
          const rows = (
            await admin.query(
              `select a.pid, a.wait_event_type, a.wait_event, l.granted
               from pg_locks l join pg_stat_activity a on a.pid=l.pid
               where l.locktype='advisory' and a.usename='justgo_runtime' and not l.granted`,
            )
          ).rows;
          waiting = rows.length;
          if (waiting)
            waits.push({ atMs: 4000 - (deadline - Date.now()), rows });
          await delay(50);
        }
        await holder.query('commit');
        replies = await Promise.all(pending);
      } finally {
        holder.release();
      }
      const rows = (
        await admin.query(
          'select count(*)::int as count from justgo.device_transfers where code_digest=$1',
          [codeDigest],
        )
      ).rows[0] as { count: number };
      return {
        session: session.status,
        statuses: replies.map((reply) => reply.status).sort(),
        bodies: replies.map((reply) => normalize(reply.body)),
        maxWaiting: Math.max(
          0,
          ...waits.map((wait) => (wait as { rows: unknown[] }).rows.length),
        ),
        waits: waits.slice(-1),
        transferRows: rows.count,
      };
    };
    const node = await contend(nodeLegacy);
    const head = await contend(edgeLegacy);
    return {
      pass:
        head.session === 200 &&
        JSON.stringify(head.statuses) === JSON.stringify(node.statuses) &&
        head.statuses.filter((status) => status === 200).length === 1 &&
        head.maxWaiting >= 1 &&
        head.transferRows === 1,
      summary: `edge statuses ${head.statuses.join('/')} with ${head.maxWaiting} waiting on the advisory lock, node ${node.statuses.join('/')} with ${node.maxWaiting} waiting, rows ${head.transferRows}`,
      receipt: { trunkNode: node, headEdge: head },
    };
  });

  await lane(group, 8, 'buffer-paths.json', async () => {
    const user = await managedUser(edge);
    const session = await call(edge, 'GET', '/v1/auth/session', {
      token: user.token,
    });
    const first = attemptInput(user, new Date(now - 240_000));
    const second = attemptInput(user, new Date(now - 230_000));
    const writes = [
      await call(edge, 'POST', '/v1/attempts', {
        token: user.token,
        body: first,
      }),
      await call(edge, 'POST', '/v1/attempts', {
        token: user.token,
        body: second,
      }),
    ];
    const date = first.startedAt.slice(0, 10);
    const page = await call(edge, 'GET', `/v1/attempts?date=${date}&limit=1`, {
      token: user.token,
    });
    const cursor =
      (page.body as { nextCursor?: string | null }).nextCursor ?? '';
    const next = await call(
      edge,
      'GET',
      `/v1/attempts?date=${date}&limit=1&cursor=${encodeURIComponent(cursor)}`,
      { token: user.token },
    );
    const facts = await call(edge, 'GET', '/__trial/runtime');
    const sessionBody = session.body as { sessionId?: string };
    const firstPage =
      (page.body as { entries?: { id: string }[] }).entries ?? [];
    const nextPage =
      (next.body as { entries?: { id: string }[] }).entries ?? [];
    const noReferenceError = ![session, page, next].some((reply) =>
      reply.text.includes('ReferenceError'),
    );
    return {
      pass:
        session.status === 200 &&
        sessionBody.sessionId === user.sessionId &&
        writes.every((write) => write.status === 201) &&
        page.status === 200 &&
        cursor.length > 0 &&
        firstPage[0]?.id === first.id &&
        next.status === 200 &&
        nextPage[0]?.id === second.id &&
        noReferenceError,
      summary: `managed token decode ${session.status} (session id match ${sessionBody.sessionId === user.sessionId}), cursor encode ${page.status}, cursor decode ${next.status}, globals ${JSON.stringify(facts.body)}`,
      receipt: { session, page, next, runtime: facts.body },
    };
  });

  let worstUser: ManagedUser | undefined;
  await lane(group, 9, 'worst-sync.json', async () => {
    const user = await managedUser(edge);
    worstUser = user;
    const { attemptId, parents } = await seedParents(edge, user);
    const batch = worstBatch(user, attemptId, parents);
    const reply = await call(edge, 'POST', '/v1/journal-sync', {
      token: user.token,
      raw: batch.raw,
      timeoutMs: 120_000,
    });
    const body = reply.body as { saved?: number; versions?: unknown[] };
    const stored = (
      await admin.query<{ count: number }>(
        'select count(*)::int as count from justgo.journal_versions where user_id=$1',
        [user.userId],
      )
    ).rows[0]!.count;
    return {
      pass: reply.status === 200 && body.saved === 50 && stored === 100,
      summary: `status ${reply.status}, saved ${body.saved}, stored ${stored}, wall ${reply.wallMs.toFixed(0)} ms, queries ${reply.headers['x-justgo-trial-queries']}, body ${batch.bytes} bytes`,
      receipt: {
        status: reply.status,
        saved: body.saved,
        storedVersions: stored,
        wallMs: reply.wallMs,
        queries: Number(reply.headers['x-justgo-trial-queries']),
        bodyBytes: batch.bytes,
        escapedControlCharactersPerField: batch.escapedPerField,
        errorBody: reply.status === 200 ? undefined : reply.body,
        cpu: 'see report.md perf section; the perf container measures CPU per request with the inspector',
      },
    };
  });
  void worstUser;

  await lane(group, 10, 'sentry-envelope.json', async () => {
    const user = await managedUser(edge);
    const canary = `reflection-canary-${randomBytes(8).toString('hex')}`;
    const attemptId = randomUUID();
    const before = envelopes.length;
    const reply = await call(edge, 'POST', '/v1/journal-sync', {
      token: user.token,
      body: {
        expectedEpoch: user.dataEpoch,
        versions: [version(attemptId, new Date(now - 900_000), [], canary)],
      },
      headers: { 'x-justgo-trial-failpoint': 'after-insert' },
    });
    const requestId = reply.headers['x-request-id'] ?? '';
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && envelopes.length === before)
      await delay(50);
    const received = envelopes.slice(before);
    const match = received.find((item) => item.text.includes(requestId));
    const text = match?.text ?? '';
    const forbidden = {
      token: text.includes(user.token),
      tokenPayload: text.includes(user.token.split('.')[1] ?? '-'),
      reflectionText: text.includes(canary),
      attemptId: text.includes(attemptId),
      authUserId: text.includes(user.authUserId),
      userId: text.includes(user.userId),
      bearerWord: /bearer/i.test(text),
      requestBodyKeys: /versions|reflection|expectedEpoch/.test(text),
    };
    const lines = text.split('\n').filter(Boolean);
    return {
      pass:
        reply.status === 503 &&
        Boolean(match) &&
        Object.values(forbidden).every((found) => !found),
      summary: `server error ${reply.status}, envelopes received ${received.length}, matched ${Boolean(match)}, forbidden content ${JSON.stringify(forbidden)}`,
      receipt: {
        status: reply.status,
        requestId,
        envelope: lines.map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return line;
          }
        }),
        forbidden,
      },
    };
  });

  await lane(group, 0, 'tls-probe.json', async () => {
    const node = new Pool({
      connectionString: (() => {
        const url = new URL(runtimeUrl);
        url.hostname = 'localhost';
        return url.toString();
      })(),
      ssl: { rejectUnauthorized: true, ca: caPem },
      max: 1,
    });
    let nodeTls: unknown;
    try {
      nodeTls = (
        await node.query(
          'select ssl, version from pg_stat_ssl where pid = pg_backend_pid()',
        )
      ).rows[0];
    } finally {
      await node.end();
    }
    const ready = await call(edgeTls, 'GET', '/ready');
    const user = await managedUser(edgeTls);
    const session = await call(edgeTls, 'GET', '/v1/auth/session', {
      token: user.token,
    });
    const attempt = await call(edgeTls, 'POST', '/v1/attempts', {
      token: user.token,
      body: attemptInput(user, new Date(now - 60_000)),
    });
    const select1 = await call(edgeTls, 'GET', '/__trial/select1');
    const tlsSessions = (
      await admin.query(
        `select s.ssl, s.version from pg_stat_ssl s join pg_stat_activity a on a.pid=s.pid
         where a.usename='justgo_runtime' and s.ssl`,
      )
    ).rows;
    return {
      pass:
        ready.status === 200 &&
        session.status === 200 &&
        attempt.status === 201 &&
        tlsSessions.length > 0,
      summary: `verify-full against the throwaway CA: ready ${ready.status}, managed session ${session.status}, write transaction ${attempt.status}, TLS runtime connections ${tlsSessions.length}`,
      receipt: {
        nodeTls,
        ready,
        session: session.status,
        attempt: attempt.status,
        select1: select1.body,
        tlsSessions,
      },
    };
  });

  return {
    boot: boot.status,
    coldHealthMs: Math.round(coldHealthMs),
    warmHealthMs: Math.round(warmHealthMs * 10) / 10,
    runtime: runtime.body,
  };
}

async function cpuLimitProbe(kind: BundleKind) {
  const results: Record<string, unknown[]> = {};
  for (const policy of ['per_request', 'per_worker'] as const) {
    const container = await startEdge(
      `edge-trial-limit-${policy}`,
      9300,
      policy,
      [
        {
          name: 'cli',
          functionDir: functionDir(kind),
          importMap: importMap(kind),
          env: managedEdgeEnv(),
          ...cliLimits,
        },
        {
          name: 'off',
          functionDir: functionDir(kind),
          importMap: importMap(kind),
          env: managedEdgeEnv(),
          ...noLimits,
        },
      ],
    );
    const entry = (variant: string): Entry => ({
      name: `limit-${policy}-${variant}`,
      origin: container.origin,
      prefix: '/api',
      headers: { 'x-edge-trial-variant': variant },
    });
    const steps: unknown[] = [];
    const burn = async (variant: string, ms: number) => {
      const reply = await call(
        entry(variant),
        'GET',
        `/__trial/burn?ms=${ms}`,
        { timeoutMs: 60_000 },
      ).catch(
        (error: Error) =>
          ({ status: -1, body: error.message, wallMs: 0 }) as unknown as Reply,
      );
      const facts = await call(entry(variant), 'GET', '/__trial/runtime').catch(
        () => undefined,
      );
      steps.push({
        variant,
        requestedMs: ms,
        status: reply.status,
        body: reply.body,
        wallMs: Math.round(reply.wallMs),
        workerAfter: facts?.body,
      });
    };
    await waitFor(entry('cli'), '/__trial/runtime', 90_000);
    await waitFor(entry('off'), '/__trial/runtime', 90_000);
    for (const ms of [500, 1500, 2500]) await burn('cli', ms);
    for (const ms of [700, 700, 700]) await burn('cli', ms);
    await burn('off', 2500);
    results[policy] = steps;
    await stopEdge(container.name);
  }
  return results;
}

type Runtime = 'node' | 'edge';
const runtimes: Runtime[] = ['node', 'edge'];
type Route = 'health' | 'guest catalog' | 'attempt write' | 'worst sync';
const routes: Route[] = [
  'health',
  'guest catalog',
  'attempt write',
  'worst sync',
];
const smallRouteNames: Route[] = ['health', 'guest catalog', 'attempt write'];
type Pass = 'control' | 'timed' | 'profiled';
type Sample = {
  pass: Pass;
  entry: Runtime;
  round: number;
  first: Runtime;
  position: number;
  route: Route;
  previousRoute: Route | 'setup';
  afterOtherEntry: boolean;
  gapMs: number;
  status: number;
  wallMs: number;
  queries: number;
  processCpuMs: number;
  threadCpuMs: Record<string, number>;
  gapThreadCpuMs?: Record<string, number>;
  isolateCpuMs?: number;
  helperCpuMs?: number;
  gapIsolateCpuMs?: number;
  gapHelperCpuMs?: number;
  profileCpuMs?: number;
  profileJsMs?: number;
  profileGcMs?: number;
  profileIdleMs?: number;
};

/**
 * In run 42379458521 Edge health requests split into helper-thread CPU of at
 * most 0.38 ms (13 of 20), 9.0 ms (one, with no worker-thread cost) and 14.5 to
 * 20.4 ms (the six slow ones). 2 ms is about five times the quiet ceiling and
 * seven times below the slow group.
 */
const pauseThresholdMs = 2;
const helperThresholdsMs = [1, 2, 5, 10];
/** V8's platform worker threads: `V8Worker` on Node, `V8 DefaultWorke` on Edge. */
const isHelperThread = (comm: string | undefined) =>
  comm?.startsWith('V8') ?? false;

function mulberry32(start: number) {
  let state = start >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
  }
  return copy;
}

type Round = { round: number; first: Runtime; order: Route[] };

/** Each entry goes first in exactly half the rounds, and both run a round's routes in the same order. */
function schedule(
  count: number,
  among: readonly Route[],
  random: () => number,
) {
  const firsts = shuffled(
    Array.from({ length: count }, (_, index) => runtimes[index % 2]!),
    random,
  );
  return firsts.map((first, index): Round => ({
    round: index + 1,
    first,
    order: shuffled(among, random),
  }));
}

function perfPlans() {
  const random = mulberry32(seed);
  return {
    control: schedule(controlRounds, smallRouteNames, random),
    warmup: schedule(warmupRounds, routes, random),
    timed: schedule(rounds, routes, random),
    profiledWarmup: schedule(profiledWarmupRounds, routes, random),
    profiled: schedule(profiledRounds, routes, random),
  };
}
type Plans = ReturnType<typeof perfPlans>;

type Threads = Map<string, { comm: string; ns: number }>;
const cpuReaders: Record<string, 'proc' | 'sudo'> = {};

async function threadCpu(pid: number): Promise<Threads> {
  const threads: Threads = new Map();
  try {
    await Promise.all(
      (await readdir(`/proc/${pid}/task`)).map(async (tid) => {
        const stat = await readFile(
          `/proc/${pid}/task/${tid}/schedstat`,
          'utf8',
        ).catch(() => '');
        if (!stat) return;
        const comm = await readFile(
          `/proc/${pid}/task/${tid}/comm`,
          'utf8',
        ).catch(() => '?');
        threads.set(tid, { comm: comm.trim(), ns: Number(stat.split(' ')[0]) });
      }),
    );
    if (threads.size) {
      cpuReaders[pid] = 'proc';
      return threads;
    }
  } catch {
    /* fall back to sudo below */
  }
  threads.clear();
  const { stdout } = await run('sudo', [
    '-n',
    'sh',
    '-c',
    `for t in /proc/${pid}/task/*; do printf '%s\\t%s\\t%s\\n' "\${t##*/}" "$(cat "$t/comm")" "$(cut -d' ' -f1 "$t/schedstat")"; done`,
  ]);
  for (const line of stdout.trim().split('\n')) {
    const [tid, comm, ns] = line.split('\t');
    if (tid) threads.set(tid, { comm: comm ?? '?', ns: Number(ns) });
  }
  cpuReaders[pid] = 'sudo';
  return threads;
}

function threadDelta(before: Threads, after: Threads) {
  const delta: Record<string, number> = {};
  for (const [tid, item] of after) {
    const ms = (item.ns - (before.get(tid)?.ns ?? 0)) / 1e6;
    if (ms > 0) delta[tid] = ms;
  }
  return delta;
}

function edgeSyncCpuByThread(samples: Sample[]) {
  const totals: Record<string, number> = {};
  for (const sample of samples)
    if (sample.entry === 'edge' && sample.route === 'worst sync')
      for (const [tid, ms] of Object.entries(sample.threadCpuMs))
        totals[tid] = (totals[tid] ?? 0) + ms;
  return totals;
}

/** The Edge user worker isolate is the thread that runs the app's JavaScript for the sync. */
function busiestThread(totals: Record<string, number>) {
  return Object.entries(totals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

class Inspector {
  private id = 0;
  private waiting = new Map<
    number,
    (value: { result?: unknown; error?: unknown }) => void
  >();
  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        result?: unknown;
        error?: unknown;
      };
      if (message.id !== undefined) this.waiting.get(message.id)?.(message);
    });
  }
  static async connect(httpOrigin: string) {
    const deadline = Date.now() + 30_000;
    let targets: {
      webSocketDebuggerUrl?: string;
      url?: string;
      title?: string;
    }[] = [];
    while (Date.now() < deadline) {
      targets = (await (
        await fetch(`${httpOrigin}/json/list`)
      ).json()) as typeof targets;
      if (targets.some((target) => target.webSocketDebuggerUrl)) break;
      await delay(250);
    }
    const target = targets.filter((item) => item.webSocketDebuggerUrl).at(-1);
    if (!target?.webSocketDebuggerUrl)
      throw new Error(`no inspector target at ${httpOrigin}`);
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      socket.addEventListener('open', resolveOpen, { once: true });
      socket.addEventListener('error', rejectOpen, { once: true });
    });
    return { inspector: new Inspector(socket), targets };
  }
  async send(method: string, params: Record<string, unknown> = {}) {
    const id = ++this.id;
    const reply = await new Promise<{ result?: unknown; error?: unknown }>(
      (resolveReply, rejectReply) => {
        const timer = setTimeout(
          () => rejectReply(new Error(`${method} timed out`)),
          60_000,
        );
        this.waiting.set(id, (value) => {
          clearTimeout(timer);
          resolveReply(value);
        });
        this.socket.send(JSON.stringify({ id, method, params }));
      },
    );
    this.waiting.delete(id);
    if (reply.error)
      throw new Error(`${method}: ${JSON.stringify(reply.error)}`);
    return reply.result as Record<string, unknown>;
  }
  close() {
    this.socket.close();
  }
}

type CpuProfile = {
  nodes: { id: number; callFrame: { functionName: string } }[];
  samples?: number[];
  timeDeltas?: number[];
};
function profileCpu(profile: CpuProfile) {
  const names = new Map(
    profile.nodes.map((node) => [node.id, node.callFrame.functionName]),
  );
  let total = 0;
  let idle = 0;
  let program = 0;
  let gc = 0;
  (profile.samples ?? []).forEach((id, index) => {
    const delta = profile.timeDeltas?.[index] ?? 0;
    total += delta;
    const name = names.get(id);
    if (name === '(idle)') idle += delta;
    else if (name === '(program)') program += delta;
    else if (name === '(garbage collector)') gc += delta;
  });
  return {
    profileCpuMs: (total - idle) / 1000,
    profileJsMs: (total - idle - program) / 1000,
    profileGcMs: gc / 1000,
    profileIdleMs: idle / 1000,
  };
}

/** Versions per attempt stay at or under 1,300, inside the 2,300 the first trial reached. */
const syncsPerFixture = 25;
type SyncFixture = Awaited<ReturnType<typeof seedParents>>;
type Rig = {
  entries: Record<Runtime, Entry>;
  users: Record<Runtime, ManagedUser>;
  fixtures: Record<Runtime, SyncFixture[]>;
  syncs: Record<Runtime, number>;
  last: Record<
    Runtime,
    { route: Route | 'setup'; endedAt: number; after?: Threads }
  >;
  lastServed?: Runtime;
  inspectors?: Record<Runtime, Inspector>;
  threadNames: Record<Runtime, Record<string, string>>;
  samples: Sample[];
};

async function makeRig(node: Entry, edge: Entry): Promise<Rig> {
  const users = {
    node: await managedUser(node),
    edge: await managedUser(edge),
  };
  const started = performance.now();
  return {
    entries: { node, edge },
    users,
    fixtures: { node: [], edge: [] },
    syncs: { node: 0, edge: 0 },
    last: {
      node: { route: 'setup', endedAt: started },
      edge: { route: 'setup', endedAt: started },
    },
    threadNames: { node: {}, edge: {} },
    samples: [],
  };
}

async function addFixtures(rig: Rig, syncsPerEntry: number) {
  for (const which of runtimes)
    for (let index = 0; index < syncsPerEntry; index += syncsPerFixture)
      rig.fixtures[which].push(
        await seedParents(rig.entries[which], rig.users[which]),
      );
}

/** Builds the request before any clock is read, so the 4 MiB body costs the harness and not the window. */
function prepare(rig: Rig, which: Runtime, route: Route) {
  const entry = rig.entries[which];
  const user = rig.users[which];
  switch (route) {
    case 'health':
      return () => call(entry, 'GET', '/health');
    case 'guest catalog':
      return () => call(entry, 'GET', '/v1/guest/challenges');
    case 'attempt write': {
      const body = attemptInput(user, new Date(Date.now() - 60_000));
      return () =>
        call(entry, 'POST', '/v1/attempts', { token: user.token, body });
    }
    case 'worst sync': {
      const fixture =
        rig.fixtures[which][Math.floor(rig.syncs[which]++ / syncsPerFixture)];
      if (!fixture) throw new Error(`no sync fixture left for ${which}`);
      const { raw } = worstBatch(user, fixture.attemptId, fixture.parents);
      return () =>
        call(entry, 'POST', '/v1/journal-sync', {
          token: user.token,
          raw,
          timeoutMs: 120_000,
        });
    }
  }
}

async function untimed(rig: Rig, which: Runtime, route: Route) {
  const reply = await prepare(rig, which, route)();
  if (reply.status !== 200 && reply.status !== 201)
    throw new Error(
      `${which} warm-up ${route} returned ${reply.status} ${reply.text.slice(0, 200)}`,
    );
  rig.last[which] = { route, endedAt: performance.now() };
  rig.lastServed = which;
}

const turnOrder = (first: Runtime) =>
  first === 'node' ? runtimes : [...runtimes].reverse();

async function warmUp(rig: Rig, plan: Round[]) {
  for (const slot of plan)
    for (const which of turnOrder(slot.first))
      for (const route of slot.order) await untimed(rig, which, route);
}

async function measure(
  rig: Rig,
  pass: Pass,
  slot: Round,
  position: number,
  which: Runtime,
  route: Route,
  profileDir?: string,
) {
  const pid = rig.entries[which].pid!;
  const previous = rig.last[which];
  const afterOtherEntry =
    rig.lastServed !== undefined && rig.lastServed !== which;
  const request = prepare(rig, which, route);
  const inspector = pass === 'profiled' ? rig.inspectors?.[which] : undefined;
  if (inspector) await inspector.send('Profiler.start');
  const before = await threadCpu(pid);
  const startedAt = performance.now();
  const reply = await request();
  const after = await threadCpu(pid);
  const profile = inspector
    ? ((await inspector.send('Profiler.stop')) as { profile: CpuProfile })
        .profile
    : undefined;
  for (const [tid, item] of after) rig.threadNames[which][tid] = item.comm;
  const delta = threadDelta(before, after);
  const sample: Sample = {
    pass,
    entry: which,
    round: slot.round,
    first: slot.first,
    position,
    route,
    previousRoute: previous.route,
    afterOtherEntry,
    gapMs: startedAt - previous.endedAt,
    status: reply.status,
    wallMs: reply.wallMs,
    queries: Number(reply.headers['x-justgo-trial-queries'] ?? 'NaN'),
    processCpuMs: Object.values(delta).reduce((sum, ms) => sum + ms, 0),
    threadCpuMs: delta,
    ...(previous.after
      ? { gapThreadCpuMs: threadDelta(previous.after, before) }
      : {}),
    ...(profile ? profileCpu(profile) : {}),
  };
  rig.samples.push(sample);
  rig.last[which] = { route, endedAt: performance.now(), after };
  rig.lastServed = which;
  if (profile && profileDir)
    await writeFile(
      resolve(
        profileDir,
        `${which}-${route.replaceAll(' ', '-')}-round${String(slot.round).padStart(2, '0')}.cpuprofile`,
      ),
      JSON.stringify(profile),
    );
}

async function runPass(
  rig: Rig,
  pass: Pass,
  plan: Round[],
  profileDir?: string,
) {
  for (const slot of plan) {
    for (const which of turnOrder(slot.first)) {
      let position = 0;
      for (const route of slot.order)
        await measure(rig, pass, slot, ++position, which, route, profileDir);
    }
    if (slot.round % 20 === 0 || slot.round === plan.length)
      console.info(`perf ${pass} round ${slot.round} of ${plan.length} done`);
  }
}

/** Names each entry's isolate thread, then splits every sample's thread CPU into isolate and helper time. */
function attribute(rig: Rig) {
  const edgeSyncCpu = edgeSyncCpuByThread(rig.samples);
  const isolateThread: Record<Runtime, string> = {
    node: String(rig.entries.node.pid),
    edge: busiestThread(edgeSyncCpu),
  };
  for (const sample of rig.samples) {
    const names = rig.threadNames[sample.entry];
    const thread = isolateThread[sample.entry];
    const helper = (delta: Record<string, number>) =>
      Object.entries(delta).reduce(
        (sum, [tid, ms]) => (isHelperThread(names[tid]) ? sum + ms : sum),
        0,
      );
    if (thread) sample.isolateCpuMs = sample.threadCpuMs[thread] ?? 0;
    sample.helperCpuMs = helper(sample.threadCpuMs);
    if (sample.gapThreadCpuMs) {
      if (thread) sample.gapIsolateCpuMs = sample.gapThreadCpuMs[thread] ?? 0;
      sample.gapHelperCpuMs = helper(sample.gapThreadCpuMs);
    }
  }
  const problems = isolateThread.edge ? [] : ['no Edge isolate thread found'];
  const secondaryProblems = runtimes
    .filter(
      (which) => !Object.values(rig.threadNames[which]).some(isHelperThread),
    )
    .map((which) => `no V8 helper thread found on ${which}`);
  return {
    isolateThread,
    edgeSyncCpuByThread: edgeSyncCpu,
    threadNames: rig.threadNames,
    cpuReader: {
      node: cpuReaders[String(rig.entries.node.pid)],
      edge: cpuReaders[String(rig.entries.edge.pid)],
    },
    problems,
    secondaryProblems,
  };
}

function perfVariant(kind: BundleKind): Variant {
  return {
    name: 'perf',
    functionDir: functionDir(kind),
    importMap: importMap(kind),
    env: managedEdgeEnv(),
    ...noLimits,
  };
}

const perfEdgeEntry = (origin: string, pid: number): Entry => ({
  name: 'edge-perf',
  origin,
  prefix: '/api',
  headers: { 'x-edge-trial-variant': 'perf' },
  pid,
});

/** The rule reads this pass. Neither process has an inspector, and both are fresh. */
async function timedProbe(kind: BundleKind, plans: Plans, samples: Sample[]) {
  const node = await startNode('node-perf', 3103, managedNodeEnv());
  const container = await startEdge('edge-trial-perf', 9200, 'per_worker', [
    perfVariant(kind),
  ]);
  const edge = perfEdgeEntry(container.origin, container.pid);
  await waitFor(edge, '/health', 90_000);
  const select1: unknown[] = [];
  for (let index = 0; index < 5; index++)
    select1.push((await call(edge, 'GET', '/__trial/select1')).body);
  const rig = await makeRig(node, edge);
  const workerBefore = (await call(edge, 'GET', '/__trial/runtime')).body;
  let attributed: ReturnType<typeof attribute>;
  try {
    for (let index = 0; index < warmupSmallRequests; index++)
      for (const which of runtimes)
        for (const route of smallRouteNames) await untimed(rig, which, route);
    console.info('perf small-route warm-up done');
    await runPass(rig, 'control', plans.control);
    await addFixtures(rig, warmupRounds + rounds);
    await warmUp(rig, plans.warmup);
    await runPass(rig, 'timed', plans.timed);
  } finally {
    attributed = attribute(rig);
    samples.push(...rig.samples);
  }
  const workerAfter = (await call(edge, 'GET', '/__trial/runtime')).body;
  await stopEdge(container.name);
  const bootedAt = (facts: unknown) =>
    (facts as { bootedAt?: string } | undefined)?.bootedAt;
  if (
    !bootedAt(workerBefore) ||
    bootedAt(workerBefore) !== bootedAt(workerAfter)
  )
    attributed.problems.push(
      `the Edge worker changed during the timed pass: booted ${bootedAt(workerBefore)} then ${bootedAt(workerAfter)}`,
    );
  return { ...attributed, select1, workerBefore, workerAfter };
}

/** Separate processes with the inspector attached. Nothing here feeds the decision. */
async function profiledProbe(
  kind: BundleKind,
  nodeManaged: Entry,
  nodeInspectPort: number,
  plans: Plans,
  samples: Sample[],
) {
  const container = await startEdge(
    'edge-trial-profile',
    9210,
    'per_worker',
    [perfVariant(kind)],
    9229,
  );
  const edge = perfEdgeEntry(container.origin, container.pid);
  await waitFor(edge, '/health', 90_000);
  const rig = await makeRig(nodeManaged, edge);
  await addFixtures(rig, profiledWarmupRounds + profiledRounds);
  const edgeInspector = await Inspector.connect('http://127.0.0.1:9229');
  rig.inspectors = {
    node: (await Inspector.connect(`http://127.0.0.1:${nodeInspectPort}`))
      .inspector,
    edge: edgeInspector.inspector,
  };
  const profileDir = resolve(out, 'profiles');
  await mkdir(profileDir, { recursive: true });
  let attributed: ReturnType<typeof attribute>;
  try {
    for (const inspector of Object.values(rig.inspectors)) {
      await inspector.send('Profiler.enable');
      await inspector.send('Profiler.setSamplingInterval', { interval: 100 });
    }
    await warmUp(rig, plans.profiledWarmup);
    await runPass(rig, 'profiled', plans.profiled, profileDir);
  } finally {
    attributed = attribute(rig);
    samples.push(...rig.samples);
    for (const inspector of Object.values(rig.inspectors)) inspector.close();
  }
  await stopEdge(container.name);
  return { ...attributed, edgeTargets: edgeInspector.targets };
}

const sortNumbers = (values: number[]) => [...values].sort((a, b) => a - b);
/** Nearest rank, the same p95 the first trial used. */
const quantile = (sorted: number[], q: number) =>
  sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? NaN;
function stats(values: number[]) {
  const sorted = sortNumbers(values.filter((value) => !Number.isNaN(value)));
  const middle = Math.floor(sorted.length / 2);
  return {
    n: sorted.length,
    median:
      sorted.length % 2
        ? sorted[middle]!
        : ((sorted[middle - 1] ?? NaN) + (sorted[middle] ?? NaN)) / 2,
    p90: quantile(sorted, 0.9),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    max: sorted.at(-1) ?? NaN,
  };
}
const fixed = (value: number | undefined, digits = 1) =>
  value === undefined || Number.isNaN(value) ? 'n/a' : value.toFixed(digits);
const share = (count: number, total: number) =>
  total ? `${count}/${total} (${((100 * count) / total).toFixed(1)}%)` : 'n/a';

const pauseCoincident = (sample: Sample, thresholdMs = pauseThresholdMs) =>
  (sample.helperCpuMs ?? 0) >= thresholdMs;

function summarize(samples: Sample[], pass: Pass) {
  const inPass = samples.filter((sample) => sample.pass === pass);
  const lastRound = Math.max(0, ...inPass.map((sample) => sample.round));
  const cpu = (list: Sample[]) =>
    stats(list.map((sample) => sample.isolateCpuMs ?? NaN));
  const group = (list: Sample[]) => {
    const all = cpu(list);
    return {
      n: list.length,
      pauses: list.filter((sample) => pauseCoincident(sample)).length,
      median: all.median,
      p95: all.p95,
    };
  };
  return routes
    .filter((route) => inPass.some((sample) => sample.route === route))
    .flatMap((route) =>
      runtimes.map((entry) => {
        const own = inPass.filter(
          (sample) => sample.route === route && sample.entry === entry,
        );
        const afterSync = own.filter(
          (sample) => sample.previousRoute === 'worst sync',
        );
        const profileGc = own.map((sample) => sample.profileGcMs ?? NaN);
        return {
          pass,
          route,
          entry,
          n: own.length,
          statuses: [...new Set(own.map((sample) => sample.status))],
          queries: stats(own.map((sample) => sample.queries)).median,
          isolateCpu: cpu(own),
          wall: stats(own.map((sample) => sample.wallMs)),
          processCpu: stats(own.map((sample) => sample.processCpuMs)),
          helperCpu: stats(own.map((sample) => sample.helperCpuMs ?? NaN)),
          gapIsolateCpu: stats(
            own.map((sample) => sample.gapIsolateCpuMs ?? NaN),
          ),
          gapHelperCpu: stats(
            own.map((sample) => sample.gapHelperCpuMs ?? NaN),
          ),
          pauses: own.filter((sample) => pauseCoincident(sample)).length,
          pausesAt: Object.fromEntries(
            helperThresholdsMs.map((threshold) => [
              threshold,
              own.filter((sample) => pauseCoincident(sample, threshold)).length,
            ]),
          ),
          isolateCpuQuiet: cpu(
            own.filter((sample) => !pauseCoincident(sample)),
          ),
          isolateCpuPaused: cpu(
            own.filter((sample) => pauseCoincident(sample)),
          ),
          after: {
            sync: group(afterSync),
            syncBackToBack: group(
              afterSync.filter((sample) => !sample.afterOtherEntry),
            ),
            syncAcrossTurn: group(
              afterSync.filter((sample) => sample.afterOtherEntry),
            ),
            other: group(
              own.filter((sample) => sample.previousRoute !== 'worst sync'),
            ),
          },
          halves: [
            group(own.filter((sample) => sample.round <= lastRound / 2)),
            group(own.filter((sample) => sample.round > lastRound / 2)),
          ],
          profileJs: stats(own.map((sample) => sample.profileJsMs ?? NaN)),
          profileGc: stats(profileGc),
          profileGcSeen: profileGc.filter((ms) => ms >= 1).length,
          profileGcAndPause: own.filter(
            (sample) =>
              (sample.profileGcMs ?? 0) >= 1 && pauseCoincident(sample),
          ).length,
          profileIdleTotal: own.reduce(
            (sum, sample) => sum + (sample.profileIdleMs ?? 0),
            0,
          ),
        };
      }),
    );
}

async function main() {
  await rm(out, { recursive: true, force: true });
  await mkdir(resolve(out, 'logs'), { recursive: true });
  const authPort = await listen(authStub);
  const sentryPort = await listen(sentryStub);
  fetchMap = JSON.stringify({
    [authOrigin]: `http://127.0.0.1:${authPort}`,
    [sentryOrigin]: `http://127.0.0.1:${sentryPort}`,
  });
  await prepareDatabase();
  card = await loadCard();
  const bundles = await buildFunctions();
  console.info(
    `bundles: ${JSON.stringify(bundles.map((b) => [b.entry, b.kind, b.bytes]))}`,
  );
  const nodeInspectPort = 9230;
  const nodeManaged = await startNode(
    'node-managed',
    3101,
    managedNodeEnv(),
    nodeInspectPort,
  );
  const nodeLegacy = await startNode('node-legacy2', 3102, legacyEnv());

  const laneMeta: Record<string, unknown> = {};
  for (const kind of kinds) {
    const container = await startEdge(
      `edge-trial-lanes-${kind}`,
      9100,
      'per_request',
      [
        {
          name: `${kind}-managed`,
          functionDir: functionDir(kind),
          importMap: importMap(kind),
          env: managedEdgeEnv(),
          ...cliLimits,
        },
        {
          name: `${kind}-legacy2`,
          functionDir: functionDir(kind),
          importMap: importMap(kind),
          env: legacyEdgeEnv(),
          ...cliLimits,
        },
        {
          name: `${kind}-tls`,
          functionDir: functionDir(kind),
          importMap: importMap(kind),
          env: tlsEdgeEnv(),
          ...cliLimits,
        },
      ],
    );
    try {
      laneMeta[kind] = await lanes(
        kind,
        container.origin,
        nodeManaged,
        nodeLegacy,
      );
    } catch (error) {
      laneMeta[kind] = {
        error: error instanceof Error ? error.message : String(error),
      };
      console.error(
        `[${kind}] lanes stopped: ${String(laneMeta[kind] && (laneMeta[kind] as { error: string }).error)}`,
      );
    }
    await stopEdge(container.name);
  }
  const passes = (kind: string) =>
    (laneResults[kind] ?? []).filter((item) => item.lane >= 1 && item.pass)
      .length;
  const chosen = kinds.reduce((best, kind) =>
    passes(kind) > passes(best) ? kind : best,
  );

  const harnessErrors: string[] = [];
  const failure = (stage: string, error: unknown) =>
    harnessErrors.push(
      `${stage}: ${error instanceof Error ? error.message : String(error)}`,
    );
  let cpuLimit: Record<string, unknown[]> = {};
  try {
    cpuLimit = await cpuLimitProbe(chosen);
  } catch (error) {
    failure('cpu limit probe', error);
  }
  await writeFile(resolve(out, 'cpu-limit.json'), mask(cpuLimit));
  const plans = perfPlans();
  await writeFile(
    resolve(out, 'perf-schedule.json'),
    JSON.stringify({
      seed,
      rounds,
      warmupRounds,
      warmupSmallRequests,
      controlRounds,
      profiledRounds,
      profiledWarmupRounds,
      plans,
    }),
  );
  const samples: Sample[] = [];
  let timed: Awaited<ReturnType<typeof timedProbe>> | undefined;
  try {
    timed = await timedProbe(chosen, plans, samples);
    for (const problem of timed.problems) failure('perf probe', problem);
  } catch (error) {
    failure('perf probe', error);
    await stopEdge('edge-trial-perf').catch(() => undefined);
  }
  const profileErrors: string[] = [];
  let profiled: Awaited<ReturnType<typeof profiledProbe>> | undefined;
  try {
    profiled = await profiledProbe(
      chosen,
      nodeManaged,
      nodeInspectPort,
      plans,
      samples,
    );
    profileErrors.push(...profiled.problems, ...profiled.secondaryProblems);
  } catch (error) {
    profileErrors.push(error instanceof Error ? error.message : String(error));
    await stopEdge('edge-trial-profile').catch(() => undefined);
  }
  const table = summarize(samples, 'timed');
  const controlTable = summarize(samples, 'control');
  const profiledTable = summarize(samples, 'profiled');
  const timedSamples = samples.filter((sample) => sample.pass === 'timed');
  const gapTable = runtimes.flatMap((entry) =>
    ([true, false] as const).map((afterSync) => {
      const own = timedSamples.filter(
        (sample) =>
          sample.entry === entry &&
          (sample.previousRoute === 'worst sync') === afterSync,
      );
      return {
        entry,
        previous: afterSync ? 'worst sync' : 'any other route',
        n: own.length,
        gap: stats(own.map((sample) => sample.gapMs)),
        isolateCpu: stats(own.map((sample) => sample.gapIsolateCpuMs ?? NaN)),
        helperCpu: stats(own.map((sample) => sample.gapHelperCpuMs ?? NaN)),
      };
    }),
  );
  await writeFile(resolve(out, 'perf-samples.json'), mask(samples));
  await writeFile(
    resolve(out, 'perf-summary.json'),
    mask({
      seed,
      pauseThresholdMs,
      table,
      controlTable,
      profiledTable,
      gapTable,
      timed,
      profiled,
      profileErrors,
      harnessErrors,
    }),
  );

  type Row = (typeof table)[number];
  const rowIn = (rows: Row[], route: Route, entry: Runtime) =>
    rows.find(
      (item) => item.route === route && item.entry === entry && item.n > 0,
    );
  const row = (route: Route, entry: Runtime) => rowIn(table, route, entry);
  const missing = stats([]);
  const cpuOf = (route: Route, entry: Runtime) =>
    row(route, entry)?.isolateCpu ?? missing;
  const processOf = (route: Route, entry: Runtime) =>
    row(route, entry)?.processCpu ?? missing;
  const sync = row('worst sync', 'edge');
  const syncCpu = cpuOf('worst sync', 'edge').p95;
  const syncWall = sync?.wall.p95 ?? NaN;
  const syncFails = !(syncCpu <= 1000) || !(syncWall <= 5000);
  const smallRoutes = smallRouteNames.map((route) => {
    const bound = 2 * cpuOf(route, 'node').p95;
    const over = timedSamples.filter(
      (sample) =>
        sample.route === route &&
        sample.entry === 'edge' &&
        (sample.isolateCpuMs ?? NaN) > bound,
    );
    return {
      route,
      edgeP95: cpuOf(route, 'edge').p95,
      nodeP95: cpuOf(route, 'node').p95,
      fails: !(cpuOf(route, 'edge').p95 <= 2 * cpuOf(route, 'node').p95),
      processEdgeP95: processOf(route, 'edge').p95,
      processNodeP95: processOf(route, 'node').p95,
      overBound: over.length,
      overBoundPauseCoincident: over.filter((sample) => pauseCoincident(sample))
        .length,
    };
  });
  const allStatusesOk =
    timedSamples.length > 0 &&
    timedSamples.every((s) => s.status === 200 || s.status === 201);
  const lanesChosen = (laneResults[chosen] ?? []).filter(
    (item) => item.lane >= 1,
  );
  const lanesPass =
    lanesChosen.length === 10 && lanesChosen.every((item) => item.pass);
  const decision =
    harnessErrors.length === 0 &&
    lanesPass &&
    allStatusesOk &&
    !syncFails &&
    smallRoutes.every((item) => !item.fails)
      ? 'go'
      : 'stop';

  const select1Medians = (
    (timed?.select1 ?? []) as { medianMs?: number }[]
  ).map((item) => item.medianMs ?? NaN);
  const shared = process.env.EDGE_TRIAL_SHARED_DIFF ?? 'not checked';
  const lines: string[] = [];
  lines.push('# P15-1 local runtime trial report', '');
  lines.push(`- Trial SHA: \`${sourceSha}\``);
  lines.push(`- Workflow run: ${runUrl}`);
  lines.push(`- Edge runtime image: \`${image}\``);
  lines.push(
    `- Timed rounds per entry: ${rounds}, with schedule seed \`${seed}\``,
  );
  lines.push(
    `- Shared code against origin/main (apps/api/src without edge.ts, packages/contracts): ${shared}`,
  );
  lines.push(
    `- Unit tests on the trial branch: ${process.env.EDGE_TRIAL_UNIT ?? 'not run'}`,
  );
  lines.push('', '## Bundles', '');
  lines.push(
    '| Entry | pg | Bytes | SHA-256 | External imports |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const item of bundles)
    lines.push(
      `| \`${item.entry}\` | ${item.kind} | ${item.bytes} | \`${item.sha256.slice(0, 16)}\` | ${item.externals.join(', ')} |`,
    );
  lines.push(
    '',
    `Banner for bundled pg: \`${banners.bundled.replaceAll('\n', ' ')}\``,
  );
  lines.push(
    '',
    `Banner for npm pg: \`${banners['npm-pg'].replaceAll('\n', ' ')}\``,
  );
  lines.push(
    '',
    `Banner for npm pg with Buffer: \`${banners['npm-pg-buffer'].replaceAll('\n', ' ')}\``,
  );
  lines.push('', '## Runtime facts', '');
  for (const [kind, meta] of Object.entries(laneMeta))
    lines.push(`- ${kind}: \`${JSON.stringify(meta)}\``);
  lines.push('', '## Lanes', '');
  for (const kind of kinds) {
    lines.push(
      `### pg ${kind}`,
      '',
      '| Lane | Receipt | Result | Detail |',
      '| --- | --- | --- | --- |',
    );
    for (const item of laneResults[kind] ?? [])
      lines.push(
        `| ${item.lane || 'TLS'} | \`receipts/${kind}/${item.slug}\` | ${item.pass ? 'pass' : 'fail'} | ${item.summary.replaceAll('|', '/')} |`,
      );
    lines.push('');
  }
  lines.push(
    `Chosen pg variant for the perf probe and the decision: **${chosen}**.`,
    '',
  );
  lines.push('## CPU limit', '');
  lines.push(
    'The main service creates user workers with the CLI local-serve limits (soft 1,000 ms, hard 2,000 ms) for `cli` and no limits for `off`. Each step burns CPU in one request. Receipt `cpu-limit.json`.',
    '',
  );
  for (const [policy, steps] of Object.entries(cpuLimit)) {
    lines.push(
      `### ${policy}`,
      '',
      '| Variant | Burn ms | Status | Wall ms | Worker booted at |',
      '| --- | --- | --- | --- | --- |',
    );
    for (const step of steps as {
      variant: string;
      requestedMs: number;
      status: number;
      wallMs: number;
      workerAfter?: { bootedAt?: string };
    }[])
      lines.push(
        `| ${step.variant} | ${step.requestedMs} | ${step.status} | ${step.wallMs} | ${step.workerAfter?.bootedAt ?? 'n/a'} |`,
      );
    lines.push('');
  }
  const entryName = (entry: Runtime) =>
    entry === 'node' ? 'trunk Node' : 'head Edge';
  const digitsFor = (route: Route) => (route === 'worst sync' ? 1 : 2);
  const bootedAt = (facts: unknown) =>
    (facts as { bootedAt?: string } | undefined)?.bootedAt ?? 'unknown';
  const edgeThread = timed?.isolateThread.edge ?? '';
  lines.push('## Perf', '');
  lines.push(
    `- Seed \`${seed}\`. One mulberry32 stream draws every schedule below. Receipt \`perf-schedule.json\`.`,
    `- Timed pass: ${rounds} rounds per entry on a fresh trunk Node process and a fresh Edge container, both started without an inspector. A round runs the four routes once on each entry, in one shuffled order that both entries share. Each entry goes first in ${rounds / 2} rounds, in shuffled sequence.`,
    `- Untimed before the timed pass: ${warmupSmallRequests} requests per small route per entry, then ${warmupRounds} full rounds.`,
    `- Control pass: ${controlRounds} timed rounds of the three small routes alone, on the same two processes, after the small-route warm-up and before either process had served any sync. The rule does not read it.`,
    `- Profiled pass: ${profiledRounds} rounds, after ${profiledWarmupRounds} untimed ones, on a second Edge container and the lanes' Node process, both with the inspector attached. The rule does not read it.`,
    '',
  );
  lines.push(
    `CPU source for the rule: on-CPU time of the isolate thread from /proc/<pid>/task/<tid>/schedstat, read before and after each request of the timed pass (reader: Node ${timed?.cpuReader.node ?? 'n/a'}, Edge ${timed?.cpuReader.edge ?? 'n/a'}). That is Node's main thread and the Edge user worker thread (\`${edgeThread}\` named \`${timed?.threadNames.edge[edgeThread] ?? '?'}\`), the clock the runtime's own CPU limit reads. The Edge worker booted at ${bootedAt(timed?.workerBefore)} and reported ${bootedAt(timed?.workerAfter)} after the pass. Process CPU sums every thread, which on Edge includes the trial main service that stands in for the gateway and the Tokio threads.`,
    '',
    `Pause-coincident: V8's helper threads (\`V8Worker\` on Node, \`V8 DefaultWorke\` on Edge) used at least ${pauseThresholdMs} ms of CPU between the two clock reads around the request. In run 42379458521 the Edge health requests split into at most 0.38 ms of helper CPU (13 of 20), 9.0 ms (one, with no worker-thread cost) and 14.5 to 20.4 ms (the six slow ones). ${pauseThresholdMs} ms is about five times above the quiet group and seven times below the slow one. The class reads the helper threads only and never the request's own CPU. Those threads also run concurrent compile jobs, and on Edge they serve the main-service isolate too, so the label means helper activity overlapped the request. It does not prove a collection. Every worst-case sync meets the test, so the label separates requests only on the small routes.`,
    '',
  );
  lines.push(
    '### Timed pass: isolate CPU (the rule reads this table)',
    '',
    '| Route | Entry | n | Median ms | p90 ms | p95 ms | p99 ms | Max ms | Bound ms | Pause-coincident | p95 ms without pause-coincident requests (secondary) |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const item of table) {
    const digits = digitsFor(item.route);
    const bound =
      item.entry === 'node'
        ? ''
        : item.route === 'worst sync'
          ? '1000'
          : fixed(2 * cpuOf(item.route, 'node').p95, 2);
    lines.push(
      `| ${item.route} | ${entryName(item.entry)} | ${item.n} | ${fixed(item.isolateCpu.median, digits)} | ${fixed(item.isolateCpu.p90, digits)} | ${fixed(item.isolateCpu.p95, digits)} | ${fixed(item.isolateCpu.p99, digits)} | ${fixed(item.isolateCpu.max, digits)} | ${bound} | ${share(item.pauses, item.n)} | ${fixed(item.isolateCpuQuiet.p95, digits)} (n ${item.isolateCpuQuiet.n}) |`,
    );
  }
  lines.push(
    '',
    '### Timed pass: wall, process CPU and helper CPU',
    '',
    '| Route | Entry | Wall median / p95 / p99 / max ms | Process CPU median / p95 ms | Helper CPU median / p95 / max ms | Queries | Statuses |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const item of table)
    lines.push(
      `| ${item.route} | ${entryName(item.entry)} | ${fixed(item.wall.median)} / ${fixed(item.wall.p95)} / ${fixed(item.wall.p99)} / ${fixed(item.wall.max)} | ${fixed(item.processCpu.median, 2)} / ${fixed(item.processCpu.p95, 2)} | ${fixed(item.helperCpu.median, 2)} / ${fixed(item.helperCpu.p95, 2)} / ${fixed(item.helperCpu.max, 2)} | ${fixed(item.queries, 0)} | ${item.statuses.join(',')} |`,
    );
  const small = (rows: Row[]) =>
    rows.filter((item) => item.route !== 'worst sync');
  lines.push(
    '',
    '### Timed pass: helper activity against isolate CPU on the small routes',
    '',
    `| Route | Entry | Requests with helper CPU of at least ${helperThresholdsMs.join(' / ')} ms | Isolate CPU median / p95 ms when pause-coincident | Isolate CPU median / p95 ms otherwise |`,
    '| --- | --- | --- | --- | --- |',
  );
  for (const item of small(table))
    lines.push(
      `| ${item.route} | ${entryName(item.entry)} | ${helperThresholdsMs.map((threshold) => item.pausesAt[threshold]).join(' / ')} of ${item.n} | ${fixed(item.isolateCpuPaused.median, 2)} / ${fixed(item.isolateCpuPaused.p95, 2)} | ${fixed(item.isolateCpuQuiet.median, 2)} / ${fixed(item.isolateCpuQuiet.p95, 2)} |`,
    );
  const groupCell = (group: Row['after']['sync']) =>
    `${share(group.pauses, group.n)}, p95 ${fixed(group.p95, 2)}`;
  lines.push(
    '',
    '### Timed pass: pause-coincident share by the route that ran just before on the same entry',
    '',
    'Each cell gives the pause-coincident requests over the requests in that group, then the group p95 isolate CPU in ms. "Back to back" means the same entry served the sync as its previous request with no turn of the other entry in between.',
    '',
    '| Route | Entry | After a worst sync | After a worst sync, back to back | After a worst sync, other entry ran in between | After any other route |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const item of small(table))
    lines.push(
      `| ${item.route} | ${entryName(item.entry)} | ${groupCell(item.after.sync)} | ${groupCell(item.after.syncBackToBack)} | ${groupCell(item.after.syncAcrossTurn)} | ${groupCell(item.after.other)} |`,
    );
  lines.push(
    '',
    '### Timed pass: CPU between requests',
    '',
    'On-CPU time from the clock read that closed one request to the clock read that opened the next request on the same entry, grouped by the route that came first.',
    '',
    '| Entry | Previous route | n | Gap median / p95 ms | Isolate CPU in the gap median / p95 ms | Helper CPU in the gap median / p95 ms |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const item of gapTable)
    lines.push(
      `| ${entryName(item.entry)} | ${item.previous} | ${item.n} | ${fixed(item.gap.median)} / ${fixed(item.gap.p95)} | ${fixed(item.isolateCpu.median, 2)} / ${fixed(item.isolateCpu.p95, 2)} | ${fixed(item.helperCpu.median, 2)} / ${fixed(item.helperCpu.p95, 2)} |`,
    );
  const halfCell = (group: Row['halves'][number] | undefined) =>
    group
      ? `${fixed(group.median, 2)} / ${fixed(group.p95, 2)}, ${share(group.pauses, group.n)}`
      : 'n/a';
  lines.push(
    '',
    '### Timed pass: first half against second half',
    '',
    `| Route | Entry | Rounds 1 to ${rounds / 2}: median / p95 ms, pause-coincident | Rounds ${rounds / 2 + 1} to ${rounds}: median / p95 ms, pause-coincident |`,
    '| --- | --- | --- | --- |',
  );
  for (const item of table)
    lines.push(
      `| ${item.route} | ${entryName(item.entry)} | ${halfCell(item.halves[0])} | ${halfCell(item.halves[1])} |`,
    );
  lines.push(
    '',
    '### Control pass (not the rule): small routes before any sync',
    '',
    '| Route | Entry | n | Isolate CPU median ms | p95 ms | p99 ms | Max ms | Twice trunk p95 ms | Pause-coincident | Statuses |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const item of controlTable)
    lines.push(
      `| ${item.route} | ${entryName(item.entry)} | ${item.n} | ${fixed(item.isolateCpu.median, 2)} | ${fixed(item.isolateCpu.p95, 2)} | ${fixed(item.isolateCpu.p99, 2)} | ${fixed(item.isolateCpu.max, 2)} | ${item.entry === 'node' ? '' : fixed(2 * (rowIn(controlTable, item.route, 'node')?.isolateCpu.p95 ?? NaN), 2)} | ${share(item.pauses, item.n)} | ${item.statuses.join(',')} |`,
    );
  const idleSeen =
    (rowIn(profiledTable, 'health', 'edge')?.profileIdleTotal ?? 0) > 0;
  lines.push(
    '',
    '### Profiled pass (not the rule): inspector attached',
    '',
    `The profiles held ${idleSeen ? 'idle samples' : 'no (idle) samples on Edge, so profile time includes waiting and only JS and GC samples bound CPU from below'}. "Profile GC" is the time the profile gives to \`(garbage collector)\` on the isolate thread.`,
    '',
    '| Route | Entry | n | Isolate CPU median / p95 ms | Profile JS+GC median ms | Profile GC median / max ms | Requests with profile GC of at least 1 ms | Pause-coincident | Both |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const item of profiledTable)
    lines.push(
      `| ${item.route} | ${entryName(item.entry)} | ${item.n} | ${fixed(item.isolateCpu.median, 2)} / ${fixed(item.isolateCpu.p95, 2)} | ${fixed(item.profileJs.median, 2)} | ${fixed(item.profileGc.median, 2)} / ${fixed(item.profileGc.max, 2)} | ${item.profileGcSeen} | ${item.pauses} | ${item.profileGcAndPause} |`,
    );
  for (const error of profileErrors)
    lines.push('', `Profiled pass error: ${error}`);
  for (const problem of timed?.secondaryProblems ?? [])
    lines.push(
      '',
      `Secondary instrumentation problem, which leaves the pause counts empty and the rule untouched: ${problem}.`,
    );
  lines.push(
    '',
    `Worst-case sync query count: ${fixed(sync?.queries, 0)} per request (counted at the pg client, BEGIN and COMMIT included).`,
  );
  lines.push(
    `Loopback select 1 median of ten timed round trips in one transaction after one untimed query: ${select1Medians.map((value) => fixed(value, 3)).join(', ')} ms over five probes; first probe ${fixed(select1Medians[0], 3)} ms.`,
  );
  lines.push('', '## Secondary numbers (the rule does not read these)', '');
  for (const item of smallRoutes) {
    const edge = row(item.route, 'edge');
    const node = row(item.route, 'node');
    const quietEdge = edge?.isolateCpuQuiet.p95 ?? NaN;
    const quietNode = node?.isolateCpuQuiet.p95 ?? NaN;
    lines.push(
      `- ${item.route}: ${item.overBound} of ${edge?.n ?? 0} Edge requests were above the rule's bound of ${fixed(2 * item.nodeP95, 2)} ms, and ${item.overBoundPauseCoincident} of those were pause-coincident. Without pause-coincident requests on either entry, Edge p95 is ${fixed(quietEdge, 2)} ms against twice trunk's ${fixed(2 * quietNode, 2)} ms, which ${quietEdge <= 2 * quietNode ? 'is inside' : 'is outside'} that bound. Medians: Edge ${fixed(edge?.isolateCpu.median, 2)} ms, trunk ${fixed(node?.isolateCpu.median, 2)} ms.`,
    );
  }
  for (const entry of runtimes) {
    const health = row('health', entry);
    if (health)
      lines.push(
        `- health on ${entryName(entry)}: pause-coincident after a worst sync ${share(health.after.sync.pauses, health.after.sync.n)}, after any other route ${share(health.after.other.pauses, health.after.other.n)}.`,
      );
  }
  for (const route of smallRouteNames) {
    const edge = rowIn(controlTable, route, 'edge');
    const node = rowIn(controlTable, route, 'node');
    if (edge && node)
      lines.push(
        `- Control pass ${route}: Edge p95 ${fixed(edge.isolateCpu.p95, 2)} ms against twice trunk p95 ${fixed(2 * node.isolateCpu.p95, 2)} ms, which ${edge.isolateCpu.p95 <= 2 * node.isolateCpu.p95 ? 'is inside' : 'is outside'} that bound. Pause-coincident: Edge ${share(edge.pauses, edge.n)}, trunk ${share(node.pauses, node.n)}.`,
      );
  }
  lines.push('', '## Rule', '');
  lines.push(
    'The rule reads every request of the timed pass, with nothing filtered out.',
    '',
  );
  lines.push(
    `- Worst-case sync p95 isolate CPU ${fixed(syncCpu)} ms (limit 1,000) and p95 wall ${fixed(syncWall, 0)} ms (limit 5,000): ${syncFails ? 'fails' : 'passes'}. Process CPU p95 for comparison: ${fixed(processOf('worst sync', 'edge').p95)} ms.`,
  );
  for (const item of smallRoutes)
    lines.push(
      `- ${item.route} Edge p95 isolate CPU ${fixed(item.edgeP95, 2)} ms against twice trunk p95 ${fixed(2 * item.nodeP95, 2)} ms: ${item.fails ? 'fails' : 'passes'}. Process CPU for comparison: Edge p95 ${fixed(item.processEdgeP95, 2)} ms, trunk p95 ${fixed(item.processNodeP95, 2)} ms.`,
    );
  lines.push(
    `- Every timed perf request returned 200 or 201: ${allStatusesOk} (${timedSamples.length} of ${rounds * runtimes.length * routes.length} requests ran).`,
  );
  lines.push(`- All ten lanes pass on ${chosen}: ${lanesPass}.`);
  for (const error of harnessErrors) lines.push(`- Harness error: ${error}`);
  if (syncFails && lanesPass && smallRoutes.every((item) => !item.fails))
    lines.push(
      '- Only the sync fails. The plan says to add a section that batches the parent checks in `apps/api/src/data-sync/journal.ts` and land it before P15-6.',
    );
  lines.push('', `Decision: ${decision}`);
  await writeFile(resolve(out, 'report.md'), `${lines.join('\n')}\n`);
  await writeFile(
    resolve(out, 'results.json'),
    mask({
      sourceSha,
      runUrl,
      image,
      bundles,
      laneMeta,
      laneResults,
      chosen,
      cpuLimit,
      seed,
      rounds,
      pauseThresholdMs,
      table,
      controlTable,
      profiledTable,
      gapTable,
      smallRoutes,
      select1: timed?.select1,
      decision,
      profileErrors,
      authCalls,
      harnessErrors,
    }),
  );
  console.info(`Decision: ${decision}`);
  if (harnessErrors.length) {
    console.error(harnessErrors.join('\n'));
    process.exitCode = 1;
  }
}

try {
  await main();
} finally {
  for (const child of children) child.kill('SIGTERM');
  for (const name of containers)
    await run('docker', ['rm', '-f', name]).catch(() => undefined);
  authStub.close();
  sentryStub.close();
  await admin.end();
}
