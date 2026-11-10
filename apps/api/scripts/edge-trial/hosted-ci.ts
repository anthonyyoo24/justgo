/**
 * P15-2 hosted trial helpers for `.github/workflows/edge-trial-hosted.yml`.
 * The gated jobs run this file with plain `node`, so it imports only Node
 * built-ins and uses only erasable TypeScript. It prints names, counts and
 * digests, never a secret value or a log row.
 */
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';

type Json = Record<string, unknown>;
type Environment = Record<string, string | undefined>;

export const functionSlug = 'justgo-trial';
export const requestFiles = {
  deploy: 'supabase/trial/deploy.request',
  delete: 'supabase/trial/delete.request',
  logs: 'supabase/trial/logs.request',
} as const;
export type Operation = keyof typeof requestFiles;

const instant = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const projectRef = /^[a-z]{20}$/;

function requestObject(text: string, keys: string[]): Json {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('The request file is not JSON');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('The request file must hold one JSON object');
  if (Object.keys(value).sort().join() !== [...keys].sort().join())
    throw new Error(`The request file must hold exactly: ${keys.join(', ')}`);
  return value as Json;
}

function instantField(request: Json, name: string) {
  const value = request[name];
  if (
    typeof value !== 'string' ||
    !instant.test(value) ||
    Number.isNaN(Date.parse(value))
  )
    throw new Error(`${name} must be a UTC timestamp ending in Z`);
  return value;
}

function patternField(request: Json, name: string, pattern: RegExp) {
  const value = request[name];
  if (typeof value !== 'string' || !pattern.test(value))
    throw new Error(`${name} must match ${pattern.source}`);
  return value;
}

/** The trial key itself never leaves the Mac. The public repository holds only its SHA-256. */
export function readDeployRequest(text: string) {
  const request = requestObject(text, ['requestedAt', 'trialKeySha256']);
  return {
    requestedAt: instantField(request, 'requestedAt'),
    trialKeySha256: patternField(request, 'trialKeySha256', /^[a-f0-9]{64}$/),
  };
}

export function readDeleteRequest(text: string) {
  const request = requestObject(text, ['requestedAt']);
  return { requestedAt: instantField(request, 'requestedAt') };
}

export function readLogsRequest(text: string) {
  const request = requestObject(text, ['requestedAt', 'from', 'to', 'nonce']);
  const from = instantField(request, 'from');
  const to = instantField(request, 'to');
  const span = Date.parse(to) - Date.parse(from);
  if (span <= 0 || span > 6 * 60 * 60 * 1000)
    throw new Error('The log window must be positive and at most six hours');
  return {
    requestedAt: instantField(request, 'requestedAt'),
    from,
    to,
    nonce: patternField(request, 'nonce', /^[a-f0-9]{16}$/),
  };
}

function required(env: Environment, name: string) {
  const value = env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/**
 * The function's whole configuration. Four values come from Anthony's GitHub
 * secrets. The rest is fixed, derived from the commit, or random per deploy.
 */
export function functionSecrets(
  env: Environment,
  request: { trialKeySha256: string },
  now: Date,
  rateLimitKey: string,
): Record<string, string> {
  const ref = required(env, 'SUPABASE_PROJECT_REF');
  if (!projectRef.test(ref))
    throw new Error('SUPABASE_PROJECT_REF must be 20 lowercase letters');
  const sourceSha = required(env, 'GITHUB_SHA');
  if (!/^[a-f0-9]{40}$/.test(sourceSha))
    throw new Error('GITHUB_SHA must be a full commit SHA');
  const databaseUrl = required(env, 'EDGE_DATABASE_URL');
  let url: URL | undefined;
  try {
    url = new URL(databaseUrl);
  } catch {
    url = undefined;
  }
  if (
    !url ||
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.port !== '6543' ||
    decodeURIComponent(url.username) !== `justgo_runtime.${ref}` ||
    !url.password
  )
    throw new Error(
      'EDGE_DATABASE_URL must be the pooler URL for justgo_runtime.<SUPABASE_PROJECT_REF> on port 6543',
    );
  const caCert = required(env, 'EDGE_DATABASE_CA_CERT');
  if (!caCert.includes('-----BEGIN CERTIFICATE-----'))
    throw new Error('EDGE_DATABASE_CA_CERT must be a PEM certificate');
  const authSecretKey = required(env, 'JUSTGO_AUTH_SECRET_KEY');
  if (authSecretKey.length < 32)
    throw new Error('JUSTGO_AUTH_SECRET_KEY must have at least 32 characters');
  if (rateLimitKey.length < 32)
    throw new Error('The generated rate limit key is too short');
  const hour = 60 * 60 * 1000;
  return {
    DATABASE_URL: databaseUrl,
    DATABASE_CA_CERT: caCert,
    JUSTGO_AUTH_PUBLISHABLE_KEY: required(env, 'JUSTGO_AUTH_PUBLISHABLE_KEY'),
    JUSTGO_AUTH_SECRET_KEY: authSecretKey,
    NODE_ENV: 'production',
    APP_ENVIRONMENT: 'staging',
    MANAGED_AUTH_ENABLED: 'true',
    JUSTGO_SOURCE_SHA: sourceSha,
    // No lane reaches a rate-limited route, so this key ties to nothing outside the trial.
    IDENTITY_RATE_LIMIT_KEY: rateLimitKey,
    // The guest catalog answers 403 in staging without a window that covers now.
    BETA_ACCESS_WINDOW: JSON.stringify({
      startsAt: new Date(now.getTime() - hour).toISOString(),
      expiresAt: new Date(now.getTime() + 72 * hour).toISOString(),
    }),
    JUSTGO_TRIAL_KEY_SHA256: request.trialKeySha256,
  };
}

/** `supabase secrets set --env-file` parses with dotenv, which expands `\n` only inside double quotes. */
export function envFileText(entries: Record<string, string>) {
  return Object.entries(entries)
    .map(([name, value]) => {
      if (!/^[A-Z][A-Z0-9_]*$/.test(name) || name.startsWith('SUPABASE_'))
        throw new Error(`${name} is not a valid function secret name`);
      const quote = ["'", '`', '"'].find(
        (candidate) =>
          !value.includes(candidate) &&
          !value.endsWith('\\') &&
          (candidate !== '"' || !/\\[nr]/.test(value)),
      );
      if (!quote) throw new Error(`${name} cannot be quoted for dotenv`);
      return `${name}=${quote}${value}${quote}\n`;
    })
    .join('');
}

/** GitHub masks each registered secret, but not a password inside a URL secret. */
export function derivedMasks(secrets: Record<string, string>) {
  const masks = new Set<string>();
  const url = new URL(secrets.DATABASE_URL ?? '');
  for (const value of [
    url.password,
    decodeURIComponent(url.password),
    secrets.IDENTITY_RATE_LIMIT_KEY ?? '',
  ])
    if (value.length >= 4 && !/[\r\n]/.test(value)) masks.add(value);
  return [...masks];
}

function listedFunction(list: unknown) {
  if (list === null) return undefined;
  if (!Array.isArray(list)) throw new Error('The function list is not a list');
  const found = (list as Json[]).find((item) => item.slug === functionSlug);
  if (!found) return undefined;
  return {
    id: found.id ?? null,
    slug: found.slug,
    status: found.status ?? null,
    version: found.version ?? null,
    verifyJwt: found.verify_jwt ?? null,
    ezbrSha256: found.ezbr_sha256 ?? null,
    entrypointPath: found.entrypoint_path ?? null,
    importMapPath: found.import_map_path ?? null,
    createdAt: found.created_at ?? null,
    updatedAt: found.updated_at ?? null,
  };
}

/**
 * Lane 10. The second deploy rebuilds the bundle from the same checkout. The
 * CLI skips the upload only when that build's hash equals the hash the project
 * holds, so `No change found` proves the deployed bundle matches the build.
 */
export function deployReceipt(input: {
  bundle: unknown;
  functionsAfterDeploy: unknown;
  functionsAfterRepeat: unknown;
  secrets: unknown;
  repeatDeployLog: string;
  sourceSha: string;
  cliVersion: string;
  runUrl: string;
  expectedSecretNames: string[];
}) {
  const deployed = listedFunction(input.functionsAfterDeploy);
  const repeated = listedFunction(input.functionsAfterRepeat);
  if (!Array.isArray(input.secrets))
    throw new Error('The secret list is not a list');
  const secretNames = (input.secrets as Json[])
    .map((secret) => secret.name)
    .filter((name): name is string => typeof name === 'string')
    .sort();
  const missingSecretNames = input.expectedSecretNames.filter(
    (name) => !secretNames.includes(name),
  );
  const repeatDeployUnchanged = input.repeatDeployLog.includes(
    `No change found in Function: ${functionSlug}`,
  );
  const checks = {
    functionActive: deployed?.status === 'ACTIVE',
    verifyJwtOff: deployed?.verifyJwt === false,
    hashRecorded:
      typeof deployed?.ezbrSha256 === 'string' && deployed.ezbrSha256 !== '',
    repeatDeployUnchanged,
    versionUnchangedByRepeat:
      deployed !== undefined &&
      repeated !== undefined &&
      deployed.version === repeated.version &&
      deployed.ezbrSha256 === repeated.ezbrSha256,
    everyExpectedSecretListed: missingSecretNames.length === 0,
  };
  return {
    lane: 10,
    pass: Object.values(checks).every(Boolean),
    checks,
    sourceSha: input.sourceSha,
    runUrl: input.runUrl,
    cliVersion: input.cliVersion,
    bundle: input.bundle,
    function: deployed ?? null,
    functionAfterRepeatDeploy: repeated ?? null,
    secretNames,
    missingSecretNames,
    note: 'Secret names only. This receipt holds no secret value and no value digest.',
  };
}

export const canaryKinds = {
  bearer: 'JGTRIALBEARER',
  header: 'JGTRIALHEADER',
  body: 'JGTRIALBODY',
  marker: 'JGTRIALMARKER',
} as const;
type CanaryKind = keyof typeof canaryKinds;

export type LogHit = {
  kind: CanaryKind;
  nonceMatch: boolean;
  id: string | null;
  timestamp: string | null;
  path: string;
};

/** Reports where a canary sits in a log row, never the text around it. */
export function scanLogRows(rows: unknown[], nonce: string): LogHit[] {
  const hits: LogHit[] = [];
  for (const row of rows) {
    const fields = (typeof row === 'object' && row !== null ? row : {}) as Json;
    const label = (value: unknown) =>
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : null;
    const visit = (value: unknown, path: string) => {
      if (typeof value === 'string') {
        const upper = value.toUpperCase();
        for (const kind of Object.keys(canaryKinds) as CanaryKind[])
          if (upper.includes(canaryKinds[kind]))
            hits.push({
              kind,
              nonceMatch: upper.includes(
                `${canaryKinds[kind]}${nonce.toUpperCase()}`,
              ),
              id: label(fields.id),
              timestamp: label(fields.timestamp),
              path,
            });
      } else if (Array.isArray(value))
        value.forEach((item, index) => visit(item, `${path}[${index}]`));
      else if (typeof value === 'object' && value !== null)
        for (const [key, item] of Object.entries(value)) {
          visit(key, `${path}.<key>`);
          visit(item, path ? `${path}.${key}` : key);
        }
    };
    visit(row, '');
  }
  return hits;
}

export const logSources = [
  'function_edge_logs',
  'function_logs',
  'edge_logs',
  'auth_logs',
] as const;
export const logRowLimit = 1000;

/** CLI 3 reads one `logs` table. Older projects answer per-source tables. */
export const logDialects = {
  unified: (source: string) =>
    `select id, timestamp, source, event_message, log_attributes from logs where source = '${source}' order by timestamp desc limit ${logRowLimit}`,
  legacy: (source: string) =>
    `select id, timestamp, event_message, metadata from ${source} order by timestamp desc limit ${logRowLimit}`,
};
type Dialect = keyof typeof logDialects;

type LogQuery = (
  sql: string,
) => Promise<{ rows: unknown[] } | { error: string; fatal: boolean }>;

function withheld(text: string) {
  const upper = text.toUpperCase();
  return Object.values(canaryKinds).some((prefix) => upper.includes(prefix))
    ? '[withheld: the error text holds a canary]'
    : text.slice(0, 300);
}

/** Lane 5. Clean needs every source read in full and the path marker seen as a positive control. */
export async function scanLogs(
  request: { from: string; to: string; nonce: string },
  query: LogQuery,
) {
  const sources = [];
  let dialect: Dialect | undefined;
  let fatal: string | undefined;
  for (const source of logSources) {
    const errors: Record<string, string> = {};
    let rows: unknown[] | undefined;
    for (const candidate of dialect
      ? [dialect]
      : (Object.keys(logDialects) as Dialect[])) {
      if (fatal) break;
      const result = await query(logDialects[candidate](source));
      if ('rows' in result) {
        rows = result.rows;
        dialect = candidate;
        break;
      }
      errors[candidate] = withheld(result.error);
      if (result.fatal) fatal = errors[candidate];
    }
    sources.push({
      source,
      dialect: rows ? dialect : null,
      read: rows !== undefined,
      rows: rows?.length ?? 0,
      limitHit: (rows?.length ?? 0) >= logRowLimit,
      errors,
      hits: rows ? scanLogRows(rows, request.nonce) : [],
    });
  }
  const hits = sources.flatMap((source) =>
    source.hits.map((hit) => ({ source: source.source, ...hit })),
  );
  const leaked = hits.filter((hit) => hit.kind !== 'marker');
  const reasons = [
    ...sources
      .filter((source) => !source.read)
      .map((source) => `${source.source} could not be read`),
    ...sources
      .filter((source) => source.limitHit)
      .map((source) => `${source.source} hit the ${logRowLimit}-row limit`),
    ...(hits.some((hit) => hit.kind === 'marker' && hit.nonceMatch)
      ? []
      : [
          'the path marker of this run appears in no log, so the window is unproven',
        ]),
    ...(sources.find((source) => source.source === 'function_logs')?.rows
      ? []
      : ['function_logs returned no row, so console output is unproven']),
  ];
  return {
    lane: 5,
    window: { from: request.from, to: request.to },
    nonce: request.nonce,
    verdict:
      leaked.length > 0
        ? 'found'
        : reasons.length > 0
          ? 'inconclusive'
          : 'clean',
    reasons,
    leaked,
    sources,
    note: 'Row ids, timestamps and field paths only. No log text is saved.',
  };
}

const logsEndpoint = (ref: string) =>
  `https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs`;

function managementLogQuery(
  ref: string,
  token: string,
  window: { from: string; to: string },
): LogQuery {
  return async (sql) => {
    for (let attempt = 0; ; attempt++) {
      const url = new URL(logsEndpoint(ref));
      url.searchParams.set('sql', sql);
      url.searchParams.set('iso_timestamp_start', window.from);
      url.searchParams.set('iso_timestamp_end', window.to);
      const response = await fetch(url, {
        headers: { authorization: `Bearer ${token}` },
        redirect: 'error',
      });
      if (response.status === 429 && attempt === 0) {
        const seconds = Number(response.headers.get('retry-after'));
        await delay(
          Math.min(Number.isFinite(seconds) ? seconds : 60, 65) * 1000 + 1000,
        );
        continue;
      }
      const text = await response.text();
      if (response.status !== 200)
        return {
          error: `HTTP ${response.status}`,
          fatal: [401, 402, 403, 429].includes(response.status),
        };
      let body: Json;
      try {
        body = JSON.parse(text) as Json;
      } catch {
        return { error: 'The logs API returned invalid JSON', fatal: false };
      }
      if (body.error !== undefined && body.error !== null)
        return { error: JSON.stringify(body.error), fatal: false };
      return { rows: Array.isArray(body.result) ? body.result : [] };
    }
  };
}

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main(argv: string[], env: Environment) {
  const [command, ...args] = argv;
  if (command === 'check-request') {
    const operation = args[0] as Operation;
    const path = requestFiles[operation];
    if (!path) throw new Error('Unknown operation');
    const text = await readFile(path, 'utf8');
    const request = {
      deploy: readDeployRequest,
      delete: readDeleteRequest,
      logs: readLogsRequest,
    }[operation](text);
    console.log(JSON.stringify({ operation, request }));
    return;
  }
  if (command === 'secrets-file') {
    const [requestPath, outPath] = args;
    if (!requestPath || !outPath) throw new Error('Two paths are required');
    const secrets = functionSecrets(
      env,
      readDeployRequest(await readFile(requestPath, 'utf8')),
      new Date(),
      randomBytes(32).toString('hex'),
    );
    for (const mask of derivedMasks(secrets))
      console.log(`::add-mask::${mask}`);
    await writeFile(outPath, envFileText(secrets), { mode: 0o600 });
    console.log(
      JSON.stringify({ secretNames: Object.keys(secrets).sort() }, null, 2),
    );
    return;
  }
  if (command === 'deploy-receipt') {
    const [bundle, first, second, secrets, repeatLog, outPath] = args;
    if (!bundle || !first || !second || !secrets || !repeatLog || !outPath)
      throw new Error('Six paths are required');
    const receipt = deployReceipt({
      bundle: await json(bundle),
      functionsAfterDeploy: await json(first),
      functionsAfterRepeat: await json(second),
      secrets: await json(secrets),
      repeatDeployLog: await readFile(repeatLog, 'utf8'),
      sourceSha: required(env, 'GITHUB_SHA'),
      cliVersion: env.SUPABASE_CLI_VERSION ?? 'unknown',
      runUrl: env.TRIAL_RUN_URL ?? 'local',
      expectedSecretNames: Object.keys(
        functionSecrets(
          {
            SUPABASE_PROJECT_REF: 'a'.repeat(20),
            GITHUB_SHA: 'a'.repeat(40),
            EDGE_DATABASE_URL: `postgresql://justgo_runtime.${'a'.repeat(20)}:x@localhost:6543/postgres`,
            EDGE_DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----',
            JUSTGO_AUTH_PUBLISHABLE_KEY: 'x',
            JUSTGO_AUTH_SECRET_KEY: 'x'.repeat(32),
          },
          { trialKeySha256: 'a'.repeat(64) },
          new Date(0),
          'x'.repeat(32),
        ),
      ),
    });
    await writeFile(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(
      JSON.stringify({ pass: receipt.pass, checks: receipt.checks }, null, 2),
    );
    if (!receipt.pass) process.exitCode = 1;
    return;
  }
  if (command === 'delete-receipt') {
    const [listPath, outPath] = args;
    if (!listPath || !outPath) throw new Error('Two paths are required');
    const remaining = listedFunction(await json(listPath));
    const receipt = {
      deleted: remaining === undefined,
      sourceSha: required(env, 'GITHUB_SHA'),
      runUrl: env.TRIAL_RUN_URL ?? 'local',
      remaining: remaining ?? null,
      note: 'Function secrets are left in place. Anthony decides whether P15-8 keeps them.',
    };
    await writeFile(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(JSON.stringify({ deleted: receipt.deleted }));
    if (!receipt.deleted) process.exitCode = 1;
    return;
  }
  if (command === 'logs') {
    const [requestPath, outPath] = args;
    if (!requestPath || !outPath) throw new Error('Two paths are required');
    const request = readLogsRequest(await readFile(requestPath, 'utf8'));
    const ref = required(env, 'SUPABASE_PROJECT_REF');
    if (!projectRef.test(ref))
      throw new Error('SUPABASE_PROJECT_REF must be 20 lowercase letters');
    const scan = await scanLogs(
      request,
      managementLogQuery(ref, required(env, 'SUPABASE_ACCESS_TOKEN'), request),
    );
    const receipt = { ...scan, runUrl: env.TRIAL_RUN_URL ?? 'local' };
    await writeFile(outPath, `${JSON.stringify(receipt, null, 2)}\n`);
    console.log(
      JSON.stringify(
        {
          verdict: scan.verdict,
          reasons: scan.reasons,
          leaked: scan.leaked.length,
          sources: scan.sources.map(({ source, dialect, read, rows }) => ({
            source,
            dialect,
            read,
            rows,
          })),
        },
        null,
        2,
      ),
    );
    if (scan.verdict === 'found') process.exitCode = 1;
    return;
  }
  throw new Error(
    'Usage: hosted-ci.ts check-request|secrets-file|deploy-receipt|delete-receipt|logs',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  await main(process.argv.slice(2), process.env);
