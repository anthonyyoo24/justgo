/**
 * P15-2 hosted lanes 1 to 9, the perf probe and the CPU-limit probe. Run from
 * the Mac once the gated workflow has deployed `justgo-trial`:
 *
 *   node --import tsx apps/api/scripts/edge-trial/hosted-lanes.ts prepare-deploy
 *   node --import tsx apps/api/scripts/edge-trial/hosted-lanes.ts run <function-url> <worker-url> --deploy-receipt <path>
 *   node --import tsx apps/api/scripts/edge-trial/hosted-lanes.ts prepare-logs
 *   node --import tsx apps/api/scripts/edge-trial/hosted-lanes.ts report [--log-scan <path>]
 *   node --import tsx apps/api/scripts/edge-trial/hosted-lanes.ts prepare-delete
 *
 * It sends synthetic canaries only, never a real token or fixture proof. No
 * lane reaches a route that writes a row.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { canaryKinds, requestFiles } from './hosted-ci.js';
import { clientAddressHeaders, maxBurnMs, trialKeyHeader } from './hosted.js';

const root = resolve(import.meta.dirname, '../../../..');
const trialDir = resolve(root, '.local/edge-trial');
const receiptsDir = resolve(root, '.local/swarm/p15-2');
const keyPath = resolve(trialDir, 'trial-key');
const reportPath = resolve(trialDir, 'hosted-report.md');

export const receiptNames = {
  '1': 'hosted-ready.json',
  '2': 'gateway-pass.json',
  '3': 'statement-timeout.json',
  '4': 'client-address.json',
  '5': 'log-canary.json',
  '6': 'cold-warm.json',
  '7': 'region-pin.json',
  '8': 'guest-hosted.json',
  '9': 'body-limit.json',
  '10': 'deploy-readback.json',
  perf: 'perf-probe.json',
  cpu: 'cpu-limit.json',
} as const;
export type LaneId = keyof typeof receiptNames;
const numberedLanes = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
] as const;
const runOrder = ['1', '2', '3', '4', '8', '9', '5', 'cpu', '6', '7'] as const;
const laneFolder = (lane: LaneId) =>
  lane === 'cpu' ? 'cpu-limit' : lane === 'perf' ? 'perf' : `lane-${lane}`;

/** Numbers from the P15-1 report on the commit this trial started from. */
export const p15_1 = {
  /** The larger of the 918 ms p95 and the 985 ms single run in lane 9. */
  syncWallMs: 985,
  queries: 2812,
  /** The lowest of five loopback probes, which predicts the longest hosted sync. */
  selectOneMedianMs: 0.137,
};
export const perfLimits = {
  warmCatalogP95Ms: 300,
  firstAfterIdleMs: 2000,
  predictedSyncWallMs: 8000,
};
const hardCpuLimitMs = 2000;
const catalogPath = '/v1/guest/challenges';
const workerPaths = ['/health', '/ready', catalogPath];
const savedResponseHeaders = [
  'x-request-id',
  'x-justgo-source-sha',
  'x-justgo-environment',
  'x-justgo-startup-stage',
  'x-sb-edge-region',
  'content-type',
];

type Json = Record<string, unknown>;
type Verdict = boolean | null;
type Send = (url: string, init: RequestInit) => Promise<Response>;

export type Reply = {
  status: number | null;
  ms: number;
  headers: Record<string, string>;
  json: unknown;
  bytes: number;
  error?: string;
};

export type LaneContext = {
  functionUrl: string;
  workerUrl: string;
  trialKey: string;
  nonce: string;
  expectedSourceSha: string;
  macAddress: string | undefined;
  idleMinutes: number;
  warmRequests: number;
  rounds: number;
  burnsMs: number[];
  send: Send;
  sleep: (ms: number) => Promise<void>;
  now: () => Date;
  log: (line: string) => void;
  save: (lane: LaneId, receipt: Json) => Promise<void>;
  load: (lane: LaneId) => Promise<Json | undefined>;
};

const field = (value: unknown, name: string): unknown =>
  typeof value === 'object' && value !== null
    ? (value as Json)[name]
    : undefined;
const text = (value: unknown) => (typeof value === 'string' ? value : null);
const number = (value: unknown) => (typeof value === 'number' ? value : null);

export function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  /** Nearest rank, the same p95 the P15-1 trial used. */
  const quantile = (q: number) =>
    sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)] ?? null;
  return {
    n: sorted.length,
    p50:
      sorted.length === 0
        ? null
        : sorted.length % 2
          ? (sorted[middle] ?? null)
          : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2,
    p95: quantile(0.95),
    max: sorted.at(-1) ?? null,
  };
}

export function isPublicAddress(value: string) {
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(value);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const lower = value.toLowerCase();
  return (
    /^[0-9a-f:]+$/.test(lower) &&
    lower.split(':').length > 2 &&
    !['::', '::1'].includes(lower) &&
    !/^f[cd]|^fe[89ab]/.test(lower)
  );
}

/** Replaces each real address with a stable label. Documentation addresses the lane forged stay readable. */
export function addressMasker(keep: string[]) {
  const labels = new Map<string, string>();
  const address =
    /(?<![0-9a-f:.])(?:(?:\d{1,3}\.){3}\d{1,3}|[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7})(?![0-9a-f:.])/gi;
  return (value: string | null) =>
    value === null
      ? null
      : value.replace(address, (found) => {
          if (keep.includes(found)) return found;
          const key = found.toLowerCase();
          if (!labels.has(key)) labels.set(key, `addr-${labels.size + 1}`);
          return labels.get(key) ?? found;
        });
}

type HeaderValues = Record<string, string | null>;

/** Lane 4. A header qualifies when no forged request changes it and it holds one public address. */
export function clientAddressVerdict(
  baseline: HeaderValues,
  forged: { sent: Record<string, string>; received: HeaderValues | null }[],
  macAddress?: string,
) {
  const answered = forged.filter((request) => request.received !== null);
  const forgedAddresses = forged.flatMap((request) =>
    Object.values(request.sent).flatMap((value) => value.split(/,\s*/)),
  );
  const headers = clientAddressHeaders.map((name) => {
    const value = baseline[name] ?? null;
    const unchanged =
      value !== null &&
      answered.every((request) => request.received?.[name] === value);
    return {
      name,
      present: value !== null,
      unchangedByForgery: unchanged,
      carriesForgedAddress: answered.some((request) =>
        forgedAddresses.some((forgedAddress) =>
          (request.received?.[name] ?? '').includes(forgedAddress),
        ),
      ),
      onePublicAddress: value !== null && isPublicAddress(value),
      equalsMacAddress:
        macAddress === undefined || value === null
          ? null
          : value === macAddress,
    };
  });
  const candidates = headers
    .filter(
      (header) =>
        header.unchangedByForgery &&
        header.onePublicAddress &&
        !header.carriesForgedAddress &&
        header.equalsMacAddress !== false,
    )
    .map((header) => header.name);
  const last = (value: string | null | undefined) =>
    value?.split(/,\s*/).at(-1) ?? null;
  return {
    pass: answered.length > 0 && candidates.length > 0,
    chosen: candidates[0] ?? null,
    candidates,
    comparedToKnownMacAddress: macAddress !== undefined,
    forgedRequestsAnswered: answered.length,
    forgedRequestsRejected: forged.length - answered.length,
    headers,
    forwardedForLastElementUnchanged:
      last(baseline['x-forwarded-for']) !== null &&
      answered.every(
        (request) =>
          last(request.received?.['x-forwarded-for']) ===
          last(baseline['x-forwarded-for']),
      ),
  };
}

/** The plan's perf rule. The prediction adds the hosted query latency to the P15-1 loopback sync. */
export function perfVerdict(input: {
  warmCatalogP95Ms: number | null;
  firstAfterIdleMs: number | null;
  hostedSelectOneMedianMs: number | null;
}) {
  const predictedSyncWallMs =
    input.hostedSelectOneMedianMs === null
      ? null
      : p15_1.syncWallMs +
        p15_1.queries *
          (input.hostedSelectOneMedianMs - p15_1.selectOneMedianMs);
  const within = (value: number | null, limit: number) =>
    value === null ? null : value <= limit;
  const checks = {
    warmCatalogP95: within(input.warmCatalogP95Ms, perfLimits.warmCatalogP95Ms),
    firstAfterIdle: within(input.firstAfterIdleMs, perfLimits.firstAfterIdleMs),
    predictedSyncWall: within(
      predictedSyncWallMs,
      perfLimits.predictedSyncWallMs,
    ),
  };
  const values = Object.values(checks);
  return {
    pass: values.includes(false) ? false : values.includes(null) ? null : true,
    checks,
    predictedSyncWallMs,
    ...input,
  };
}

export type BurnStep = {
  requestedMs: number;
  status: number | null;
  workerId: string | null;
  served: number | null;
  burnedMs: number | null;
  /** The worker a probe found right after a failed burn. */
  workerAfterFailure: string | null;
};

/**
 * Per-request accounting lets one worker burn far past the limit across
 * requests that each stay under it. Per-worker accounting kills a burn under
 * the limit once the worker's total reaches it.
 */
export function cpuLimitConclusion(steps: BurnStep[]) {
  const byWorker: Record<string, number> = {};
  let current: string | null = null;
  let replaced = 0;
  let cumulativeKill = false;
  let underLimitFailure = false;
  let overLimitFailure = false;
  const smallestOk = Math.min(
    Infinity,
    ...steps
      .filter((step) => step.status === 200)
      .map((step) => step.requestedMs),
  );
  for (const step of steps) {
    if (step.status === 200 && step.workerId) {
      if (current && current !== step.workerId) replaced++;
      current = step.workerId;
      byWorker[current] = (byWorker[current] ?? 0) + (step.burnedMs ?? 0);
      continue;
    }
    const before = current ? (byWorker[current] ?? 0) : 0;
    if (step.requestedMs >= hardCpuLimitMs) overLimitFailure = true;
    else if (
      before + step.requestedMs >= hardCpuLimitMs &&
      smallestOk <= step.requestedMs
    )
      cumulativeKill = true;
    else underLimitFailure = true;
    if (step.workerAfterFailure && step.workerAfterFailure !== current) {
      if (current) replaced++;
      current = step.workerAfterFailure;
    }
  }
  const maxCumulativeMs = Math.max(0, ...Object.values(byWorker));
  const underLimit = steps.filter((step) => step.requestedMs < hardCpuLimitMs);
  /** One 700 ms burn past the limit, so a per-worker limit would have fired. */
  const cumulativeLimitRuledOut =
    maxCumulativeMs >= hardCpuLimitMs + 700 &&
    underLimit.every((step) => step.status === 200);
  const facts = {
    cumulativeLimitRuledOut,
    maxCumulativeMsOnOneWorker: maxCumulativeMs,
    cumulativeMsByWorker: byWorker,
    workersReplaced: replaced,
    backToBackBurnsAllOk:
      underLimit.length > 0 &&
      underLimit.slice(0, 4).every((step) => step.status === 200),
  };
  const conclude = (conclusion: string, why: string) => ({
    conclusion,
    why,
    ...facts,
  });
  if (steps.length === 0 || steps.some((step) => step.requestedMs > maxBurnMs))
    return conclude('Inconclusive', 'the burn steps did not run as planned');
  if (cumulativeKill && cumulativeLimitRuledOut)
    return conclude('Inconclusive', 'the evidence points both ways');
  if (cumulativeKill)
    return conclude(
      'cumulative per worker',
      `a burn under ${hardCpuLimitMs} ms failed once its worker had burned ${hardCpuLimitMs} ms in total, and the same size had passed before`,
    );
  if (underLimitFailure)
    return conclude(
      'Inconclusive',
      `a burn under ${hardCpuLimitMs} ms failed before its worker had burned ${hardCpuLimitMs} ms in total, so something other than the hard limit stopped it`,
    );
  if (cumulativeLimitRuledOut && overLimitFailure)
    return conclude(
      'per-request',
      `one worker burned ${Math.round(maxCumulativeMs)} ms across requests that each passed, and only the burn over ${hardCpuLimitMs} ms failed`,
    );
  if (cumulativeLimitRuledOut)
    return conclude(
      'Inconclusive',
      `no burn failed up to ${maxBurnMs} ms, so no hard limit was seen. A per-worker limit of ${hardCpuLimitMs} ms is ruled out`,
    );
  return conclude(
    'Inconclusive',
    `no worker reached ${hardCpuLimitMs + 700} ms of total burn, so per-worker accounting could not be observed`,
  );
}

/** Lane 7. Pin only for a clear gain, at least 10 ms and 10% on the warm catalog median. */
export function regionDecision(
  unpinned: { catalogP50Ms: number | null; regions: Record<string, number> },
  pinned: { catalogP50Ms: number | null; regions: Record<string, number> },
  region: string,
) {
  const names = (tally: Record<string, number>) => Object.keys(tally).sort();
  if (
    names(unpinned.regions).length === 0 ||
    names(pinned.regions).length === 0
  )
    return { decision: null, why: 'a run returned no x-sb-edge-region header' };
  if (names(pinned.regions).join() !== region)
    return {
      decision: 'do not pin',
      why: `x-region did not keep every request in ${region}`,
    };
  if (names(unpinned.regions).join() === region)
    return {
      decision: 'do not pin',
      why: `unpinned requests already ran in ${region}`,
    };
  if (unpinned.catalogP50Ms === null || pinned.catalogP50Ms === null)
    return { decision: null, why: 'a run has no warm catalog timing' };
  const gain = unpinned.catalogP50Ms - pinned.catalogP50Ms;
  return gain >= 10 && pinned.catalogP50Ms <= unpinned.catalogP50Ms * 0.9
    ? {
        decision: `pin ${region}`,
        why: `the pinned warm catalog median is ${gain.toFixed(1)} ms lower`,
      }
    : {
        decision: 'do not pin',
        why: `the pinned warm catalog median differs by ${gain.toFixed(1)} ms, under the 10 ms and 10% bar`,
      };
}

/** Go needs every lane and the perf rule proven. A missing or pending receipt is unproven, not passed. */
export function decision(lanes: { lane: string; pass: Verdict }[]) {
  const named = (pass: Verdict) =>
    lanes.filter((lane) => lane.pass === pass).map((lane) => lane.lane);
  const failed = named(false);
  const unproven = named(null);
  if (failed.length === 0 && unproven.length === 0) return 'Decision: go';
  return `Decision: stop (${[
    failed.length ? `failed: ${failed.join(', ')}` : '',
    unproven.length ? `unproven: ${unproven.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ')})`;
}

async function call(
  context: LaneContext,
  host: 'function' | 'worker',
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<Reply> {
  const headers = init.headers ?? {};
  if (
    host === 'worker' &&
    (init.method !== undefined ||
      Object.keys(headers).length > 0 ||
      !workerPaths.includes(path))
  )
    throw new Error('The Worker receives plain reads of three routes only');
  if (
    trialKeyHeader in headers &&
    (host !== 'function' || !path.startsWith('/__trial/'))
  )
    throw new Error('The trial key goes to trial routes only');
  const base = host === 'function' ? context.functionUrl : context.workerUrl;
  const start = performance.now();
  try {
    const response = await context.send(`${base}${path}`, {
      ...init,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(120_000),
    });
    const body = await response.text();
    const ms = performance.now() - start;
    let json: unknown = null;
    try {
      json = JSON.parse(body);
    } catch {
      json = null;
    }
    const saved: Record<string, string> = {};
    for (const name of savedResponseHeaders) {
      const value = response.headers.get(name);
      if (value !== null) saved[name] = value;
    }
    return {
      status: response.status,
      ms,
      headers: saved,
      json,
      bytes: Buffer.byteLength(body),
    };
  } catch (error) {
    const cause = field(error, 'cause');
    return {
      status: null,
      ms: performance.now() - start,
      headers: {},
      json: null,
      bytes: 0,
      error: `${error instanceof Error ? error.name : 'Error'}${text(field(cause, 'code')) ? ` ${text(field(cause, 'code'))}` : ''}`,
    };
  }
}

const trial = (
  context: LaneContext,
  path: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
) =>
  call(context, 'function', path, {
    ...init,
    headers: { ...init.headers, [trialKeyHeader]: context.trialKey },
  });

/** A reply without its body, for routes whose body is not evidence. */
const brief = ({ status, ms, headers, bytes, error }: Reply) => ({
  status,
  ms,
  headers,
  bytes,
  ...(error ? { error } : {}),
});

async function probe(
  context: LaneContext,
  headers: Record<string, string> = {},
) {
  const reply = await trial(context, '/__trial/probe', { headers });
  const worker = field(reply.json, 'worker');
  const database = field(reply.json, 'database');
  const received: HeaderValues = {};
  for (const name of clientAddressHeaders)
    received[name] = text(
      field(field(reply.json, 'clientAddressHeaders'), name),
    );
  return {
    answered: reply.status === 200 && text(field(worker, 'id')) !== null,
    reply: brief(reply),
    worker: {
      id: text(field(worker, 'id')),
      bootedAt: text(field(worker, 'bootedAt')),
      served: number(field(worker, 'served')),
    },
    statementTimeout: text(field(database, 'statementTimeout')),
    selectOneMedianMs: number(field(field(database, 'selectOne'), 'medianMs')),
    selectOneSamplesMs:
      field(field(database, 'selectOne'), 'samplesMs') ?? null,
    databaseError: field(database, 'error') ?? null,
    clientAddressHeaders: received,
  };
}

/** The probe without the address headers, which only lane 4 saves, masked. */
function withoutAddresses(result: Awaited<ReturnType<typeof probe>>) {
  return { ...result, clientAddressHeaders: undefined };
}

const header = (reply: Reply, name: string) => reply.headers[name] ?? null;
const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

async function lane1(context: LaneContext) {
  const replies = {
    workerHealth: await call(context, 'worker', '/health'),
    workerReady: await call(context, 'worker', '/ready'),
    functionHealth: await call(context, 'function', '/health'),
    functionReady: await call(context, 'function', '/ready'),
  };
  const pass =
    Object.values(replies).every((reply) => reply.status === 200) &&
    field(replies.functionReady.json, 'status') === 'ready' &&
    header(replies.functionReady, 'x-request-id') !== null;
  await context.save('1', {
    pass,
    summary: `Worker /health ${replies.workerHealth.status}, /ready ${replies.workerReady.status}. Function /health ${replies.functionHealth.status}, /ready ${replies.functionReady.status}.`,
    replies,
    functionSourceSha: header(replies.functionReady, 'x-justgo-source-sha'),
    functionStartupStage: header(
      replies.functionReady,
      'x-justgo-startup-stage',
    ),
    readinessProves: [
      'A 200 from /ready means checkDatabase passed, and it requires current_user = justgo_runtime (apps/api/src/db/client.ts:57-75).',
      'The deploy sets NODE_ENV=production, where config accepts DATABASE_SSL=disable only on loopback, so the pool ran with rejectUnauthorized and the configured CA (apps/api/src/config.ts, apps/api/src/db/client.ts:16-22).',
    ],
  });
}

async function lane2(context: LaneContext) {
  const health = await call(context, 'function', '/health');
  const fake = 'JGTRIALLANE2';
  const invalidBearer = await call(context, 'function', '/v1/access', {
    headers: { authorization: `Bearer ${fake}.${fake}.${fake}` },
  });
  const malformedBearer = await call(context, 'function', '/v1/access', {
    headers: { authorization: 'Bearer not-a-token' },
  });
  const typed = (reply: Reply) =>
    reply.status === 401 &&
    field(reply.json, 'code') === 'UNAUTHORIZED' &&
    header(reply, 'x-request-id') !== null &&
    field(reply.json, 'requestId') === header(reply, 'x-request-id');
  const pass =
    health.status === 200 &&
    header(health, 'x-request-id') !== null &&
    typed(invalidBearer) &&
    typed(malformedBearer);
  await context.save('2', {
    pass,
    summary: `/health without Authorization or apikey answered ${health.status}. An invalid bearer answered ${invalidBearer.status} ${text(field(invalidBearer.json, 'code')) ?? 'with no typed code'}.`,
    honoAnsweredHealth: header(health, 'x-request-id') !== null,
    honoAnsweredInvalidBearer: typed(invalidBearer),
    honoAnsweredMalformedBearer: typed(malformedBearer),
    replies: { health, invalidBearer, malformedBearer },
  });
}

async function lane3(context: LaneContext) {
  const result = await probe(context);
  const outcome = result.databaseError
    ? 'rejected'
    : result.statementTimeout === '4321ms'
      ? 'accepted'
      : result.statementTimeout === null
        ? 'not read'
        : 'ignored';
  await context.save('3', {
    pass: result.answered && outcome !== 'not read',
    summary:
      outcome === 'accepted'
        ? 'show statement_timeout returned 4321ms, so the pooler accepted the pool setting.'
        : outcome === 'ignored'
          ? `show statement_timeout returned ${result.statementTimeout}, so the pooler ignored the pool setting.`
          : outcome === 'rejected'
            ? 'The probe connection failed, so the pooler rejected the pool setting. Appendix C fallback applies.'
            : 'The trial route did not answer.',
    outcome,
    statementTimeout: result.statementTimeout,
    fallback:
      outcome === 'rejected'
        ? 'Remove statement_timeout from poolOptions on the branch, push a new deploy.request with Anthony’s go, then rerun lanes 1, 2 and 4 to 10.'
        : null,
    probe: withoutAddresses(result),
  });
}

const forgedSets: Record<string, string>[] = [
  { 'x-forwarded-for': '203.0.113.7' },
  { 'x-real-ip': '203.0.113.8' },
  { 'cf-connecting-ip': '203.0.113.9' },
  {
    'x-forwarded-for': '203.0.113.7',
    'x-real-ip': '203.0.113.8',
    'cf-connecting-ip': '203.0.113.9',
  },
  {
    'x-forwarded-for': '198.51.100.7, 198.51.100.17',
    'x-real-ip': '198.51.100.8',
    'cf-connecting-ip': '198.51.100.9',
  },
];

async function lane4(context: LaneContext) {
  const baseline = await probe(context);
  const forged = [];
  for (const sent of forgedSets) {
    const result = await probe(context, sent);
    forged.push({
      sent,
      status: result.reply.status,
      received: result.answered ? result.clientAddressHeaders : null,
    });
  }
  const verdict = clientAddressVerdict(
    baseline.clientAddressHeaders,
    forged,
    context.macAddress,
  );
  const mask = addressMasker(
    forgedSets.flatMap((sent) =>
      Object.values(sent).flatMap((value) => value.split(/,\s*/)),
    ),
  );
  const masked = (values: HeaderValues | null) =>
    values &&
    Object.fromEntries(
      Object.entries(values).map(([name, value]) => [name, mask(value)]),
    );
  await context.save('4', {
    ...verdict,
    pass: baseline.answered && verdict.pass,
    summary: verdict.chosen
      ? `${verdict.chosen} kept one public address through every forged request.`
      : 'No header kept one public address through every forged request.',
    note: 'Real addresses are replaced with labels. The same label is the same address.',
    baseline: masked(baseline.clientAddressHeaders),
    forged: forged.map((request) => ({
      ...request,
      received: masked(request.received),
    })),
  });
}

async function lane5(context: LaneContext) {
  const canary = (kind: keyof typeof canaryKinds) =>
    `${canaryKinds[kind]}${context.nonce}`;
  const startedAt = context.now();
  const bearer = `Bearer ${canary('bearer')}.${canary('bearer')}.${canary('bearer')}`;
  const canaryHeader = { 'x-justgo-trial-canary': canary('header') };
  const replies = {
    marker: brief(
      await call(context, 'function', `/__canary/${canary('marker')}`),
    ),
    bearerAndHeader: brief(
      await call(context, 'function', '/v1/access', {
        headers: { authorization: bearer, ...canaryHeader },
      }),
    ),
    bearerHeaderAndBody: brief(
      await call(context, 'function', '/v1/journal-sync', {
        method: 'POST',
        headers: {
          authorization: bearer,
          'content-type': 'application/json',
          ...canaryHeader,
        },
        body: JSON.stringify({ canary: canary('body') }),
      }),
    ),
  };
  const minute = 60_000;
  await context.save('5', {
    pass: null,
    summary:
      'Canaries sent. The verdict waits for the log scan from the gated workflow.',
    nonce: context.nonce,
    window: {
      from: new Date(startedAt.getTime() - 2 * minute).toISOString(),
      to: new Date(context.now().getTime() + 3 * minute).toISOString(),
    },
    sent: {
      marker: `path /__canary/${canary('marker')}, the positive control that must appear in the logs`,
      bearer: `Authorization header built from ${canary('bearer')}`,
      header: `x-justgo-trial-canary: ${canary('header')}`,
      body: `JSON body text ${canary('body')}`,
    },
    replies,
    next: 'Wait five minutes for log ingestion, run prepare-logs, push supabase/trial/logs.request with Anthony’s go, then run report --log-scan with the downloaded receipt.',
  });
}

async function lane8(context: LaneContext) {
  const workerCatalog = await call(context, 'worker', catalogPath);
  const reads = [];
  for (let index = 0; index < 20; index++) {
    const catalog = await call(context, 'function', catalogPath);
    const health = await call(context, 'function', '/health');
    const cards = field(catalog.json, 'cards');
    reads.push({
      status: catalog.status,
      cards: Array.isArray(cards) ? cards.length : null,
      bodySha256: sha256(JSON.stringify(catalog.json)),
      catalogSourceSha: header(catalog, 'x-justgo-source-sha'),
      healthStatus: health.status,
      healthSourceSha: header(health, 'x-justgo-source-sha'),
      healthEnvironment: header(health, 'x-justgo-environment'),
    });
  }
  const first = reads[0];
  const matchesWorker =
    workerCatalog.status === 200
      ? sha256(JSON.stringify(workerCatalog.json)) === first?.bodySha256
      : null;
  const pass =
    reads.every(
      (read) =>
        read.status === 200 &&
        (read.cards ?? 0) > 0 &&
        read.bodySha256 === first?.bodySha256 &&
        read.healthStatus === 200 &&
        read.healthSourceSha === context.expectedSourceSha &&
        read.healthEnvironment === 'staging',
    ) && matchesWorker !== false;
  await context.save('8', {
    pass,
    summary: `${reads.filter((read) => read.status === 200).length} of 20 catalog reads returned 200 with ${first?.cards ?? 0} cards. The paired /health reads named ${first?.healthSourceSha ?? 'no source SHA'}.`,
    expectedSourceSha: context.expectedSourceSha,
    matchesWorkerCatalog: matchesWorker,
    workerCatalogStatus: workerCatalog.status,
    planMismatch:
      'The API sends the release identity headers only on GET /health and GET /ready (apps/api/src/http/app.ts:86-94), so each catalog read is paired with a /health read.',
    reads,
  });
}

const mebibyte = 1024 * 1024;

async function lane9(context: LaneContext) {
  const rows = [];
  for (const size of [1, 4, 6]) {
    const body = `{"pad":"${'a'.repeat(size * mebibyte - 10)}"}`;
    const post = async (
      send: () => Promise<Reply>,
      reached: (reply: Reply) => boolean,
    ) => {
      let reply = await send();
      let attempts = 1;
      if (reply.status === null) {
        reply = await send();
        attempts = 2;
      }
      return {
        attempts,
        outcome:
          reply.status === null
            ? 'connection closed'
            : reached(reply)
              ? 'reached'
              : 'gateway answered',
        code: text(field(reply.json, 'code')),
        bytesCounted: number(field(reply.json, 'bytes')),
        ...brief(reply),
      };
    };
    const init = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    };
    rows.push({
      mebibytes: size,
      bytesSent: Buffer.byteLength(body),
      trialRoute: await post(
        () => trial(context, '/__trial/body', init),
        (reply) => field(reply.json, 'worker') !== undefined,
      ),
      honoRoute: await post(
        () => call(context, 'function', '/v1/journal-sync', init),
        (reply) => header(reply, 'x-request-id') !== null,
      ),
    });
  }
  // Above the API's own 4 MiB limit a closed connection is a recorded gateway answer.
  const unanswered = rows.filter(
    (row) =>
      row.mebibytes <= 4 && row.honoRoute.outcome === 'connection closed',
  );
  await context.save('9', {
    pass: unanswered.length === 0 ? true : null,
    unanswered: unanswered.map((row) => row.mebibytes),
    summary: rows
      .map(
        (row) =>
          `${row.mebibytes} MiB: Hono route ${row.honoRoute.outcome} (${row.honoRoute.status ?? 'no status'}), trial route ${row.trialRoute.outcome} (${row.trialRoute.status ?? 'no status'})`,
      )
      .join('. '),
    expectedFromHono:
      'With no Authorization, POST /v1/journal-sync answers 401 up to 4 MiB and 413 above it (apps/api/src/http/request.ts:33-122, apps/api/src/data-sync/routes.ts:48-57).',
    rows,
  });
}

async function cpuLane(context: LaneContext) {
  const before = await probe(context);
  const steps: (BurnStep & { ms: number; error: string | null })[] = [];
  for (const requestedMs of context.burnsMs) {
    const reply = await trial(context, `/__trial/burn?ms=${requestedMs}`);
    const worker = field(reply.json, 'worker');
    const ok = reply.status === 200 && text(field(worker, 'id')) !== null;
    steps.push({
      requestedMs,
      status: reply.status,
      workerId: ok ? text(field(worker, 'id')) : null,
      served: ok ? number(field(worker, 'served')) : null,
      burnedMs: ok ? number(field(reply.json, 'burnedMs')) : null,
      workerAfterFailure: ok ? null : (await probe(context)).worker.id,
      ms: reply.ms,
      error: reply.error ?? null,
    });
  }
  const after = await probe(context);
  const conclusion = cpuLimitConclusion([
    {
      requestedMs: 0,
      status: before.answered ? 200 : before.reply.status,
      workerId: before.worker.id,
      served: before.worker.served,
      burnedMs: 0,
      workerAfterFailure: null,
    },
    ...steps,
  ]);
  await context.save('cpu', {
    ...conclusion,
    summary: `${conclusion.conclusion}: ${conclusion.why}.`,
    note: 'Beside the decision, not part of it. Each burn is a busy loop on the worker, sent one after another with no pause.',
    workerBefore: before.worker,
    workerAfter: after.worker,
    steps,
  });
}

async function idleThenMeasure(
  context: LaneContext,
  headers: Record<string, string>,
) {
  const get = (path: string) => call(context, 'function', path, { headers });
  const before = await probe(context, headers);
  context.log(`Idle for ${context.idleMinutes} minutes.`);
  await context.sleep(context.idleMinutes * 60_000);
  const firstHealth = await get('/health');
  const firstCatalog = await get(catalogPath);
  const warmHealth: Reply[] = [];
  const warmCatalog: Reply[] = [];
  for (let index = 0; index < context.warmRequests; index++) {
    warmHealth.push(await get('/health'));
    warmCatalog.push(await get(catalogPath));
  }
  const after = await probe(context, headers);
  const all = [firstHealth, firstCatalog, ...warmHealth, ...warmCatalog];
  const regions: Record<string, number> = {};
  for (const reply of all) {
    const region = header(reply, 'x-sb-edge-region');
    if (region) regions[region] = (regions[region] ?? 0) + 1;
  }
  const timings = (replies: Reply[]) =>
    stats(
      replies.filter((reply) => reply.status === 200).map((reply) => reply.ms),
    );
  return {
    idleMinutes: context.idleMinutes,
    requestHeaders: headers,
    everyReplyOk: all.every((reply) => reply.status === 200),
    repliesWithoutRegionHeader: all.filter(
      (reply) => header(reply, 'x-sb-edge-region') === null,
    ).length,
    regions,
    firstHealthMs: firstHealth.status === 200 ? firstHealth.ms : null,
    firstCatalogMs: firstCatalog.status === 200 ? firstCatalog.ms : null,
    warmHealth: timings(warmHealth),
    warmCatalog: timings(warmCatalog),
    workerReplacedOverIdle:
      before.worker.id !== null && after.worker.id !== null
        ? before.worker.id !== after.worker.id
        : null,
    workerBefore: before.worker,
    workerAfter: after.worker,
    selectOneMedianMs: after.selectOneMedianMs,
    statuses: all.map((reply) => reply.status),
  };
}

async function selectOneMedian(
  context: LaneContext,
  headers: Record<string, string> = {},
) {
  const medians: number[] = [];
  for (let index = 0; index < 5; index++) {
    const result = await probe(context, headers);
    if (result.selectOneMedianMs !== null)
      medians.push(result.selectOneMedianMs);
  }
  return { probeMediansMs: medians, ...stats(medians) };
}

async function lane6AndPerf(context: LaneContext) {
  const measured = await idleThenMeasure(context, {});
  const idledLongEnough = context.idleMinutes >= 15;
  const lanePass =
    !measured.everyReplyOk ||
    measured.firstHealthMs === null ||
    measured.warmCatalog.p95 === null
      ? false
      : measured.firstHealthMs > perfLimits.firstAfterIdleMs ||
          measured.warmCatalog.p95 > perfLimits.warmCatalogP95Ms
        ? false
        : idledLongEnough
          ? true
          : null;
  const coldCatalogBoundMs =
    measured.firstHealthMs !== null && measured.firstCatalogMs !== null
      ? measured.firstHealthMs + measured.firstCatalogMs
      : null;
  await context.save('6', {
    pass: lanePass,
    summary: `First request after ${measured.idleMinutes} idle minutes took ${measured.firstHealthMs?.toFixed(0) ?? 'no'} ms. Warm guest catalog p95 over ${measured.warmCatalog.n} requests was ${measured.warmCatalog.p95?.toFixed(0) ?? 'no'} ms.`,
    ...measured,
    coldCatalogBoundMs,
    coldCatalogBoundNote: `The first request is GET /health. A catalog request on a cold worker takes at most the first /health plus the first catalog. That bound is ${coldCatalogBoundMs === null ? 'unknown' : coldCatalogBoundMs <= perfLimits.firstAfterIdleMs ? 'within' : 'over'} the ${perfLimits.firstAfterIdleMs} ms limit.`,
    coldStartObserved: measured.workerReplacedOverIdle,
  });

  for (let index = 0; index < 5; index++) {
    await call(context, 'worker', '/health');
    await call(context, 'worker', catalogPath);
  }
  const samples = {
    workerHealth: [] as Reply[],
    functionHealth: [] as Reply[],
    workerCatalog: [] as Reply[],
    functionCatalog: [] as Reply[],
  };
  for (let round = 0; round < context.rounds; round++) {
    samples.workerHealth.push(await call(context, 'worker', '/health'));
    samples.functionHealth.push(await call(context, 'function', '/health'));
    samples.workerCatalog.push(await call(context, 'worker', catalogPath));
    samples.functionCatalog.push(await call(context, 'function', catalogPath));
  }
  const summarize = (replies: Reply[]) => ({
    ...stats(
      replies.filter((reply) => reply.status === 200).map((reply) => reply.ms),
    ),
    notOk: replies.filter((reply) => reply.status !== 200).length,
  });
  const warm = {
    workerHealth: summarize(samples.workerHealth),
    workerCatalog: summarize(samples.workerCatalog),
    functionHealth: summarize(samples.functionHealth),
    functionCatalog: summarize(samples.functionCatalog),
  };
  const selectOne = await selectOneMedian(context);
  const verdict = perfVerdict({
    warmCatalogP95Ms:
      warm.functionCatalog.notOk === 0 ? warm.functionCatalog.p95 : null,
    firstAfterIdleMs: measured.firstHealthMs,
    hostedSelectOneMedianMs: selectOne.p50,
  });
  await context.save('perf', {
    ...verdict,
    pass:
      warm.functionCatalog.notOk > 0 || warm.functionHealth.notOk > 0
        ? false
        : verdict.pass && !idledLongEnough
          ? null
          : verdict.pass,
    summary: `Worker warm catalog p50 ${warm.workerCatalog.p50?.toFixed(0) ?? 'no'} ms, p95 ${warm.workerCatalog.p95?.toFixed(0) ?? 'no'} ms. Function warm catalog p50 ${warm.functionCatalog.p50?.toFixed(0) ?? 'no'} ms, p95 ${warm.functionCatalog.p95?.toFixed(0) ?? 'no'} ms. Hosted select 1 median ${selectOne.p50?.toFixed(3) ?? 'no'} ms. Predicted worst-case sync ${verdict.predictedSyncWallMs?.toFixed(0) ?? 'no'} ms.`,
    rounds: context.rounds,
    idleMinutes: measured.idleMinutes,
    baseline: {
      workerHealth: warm.workerHealth,
      workerCatalog: warm.workerCatalog,
    },
    function: {
      health: warm.functionHealth,
      catalog: warm.functionCatalog,
    },
    cold: {
      firstHealthMs: measured.firstHealthMs,
      firstCatalogMs: measured.firstCatalogMs,
      coldCatalogBoundMs,
    },
    selectOne,
    predictionAtSlowestProbeMs:
      selectOne.max === null
        ? null
        : p15_1.syncWallMs +
          p15_1.queries * (selectOne.max - p15_1.selectOneMedianMs),
    p15_1,
    limits: perfLimits,
  });
}

const pinnedRegion = 'ca-central-1';

async function lane7(context: LaneContext) {
  const unpinned = await context.load('6');
  const pinned = await idleThenMeasure(context, { 'x-region': pinnedRegion });
  const selectOne = await selectOneMedian(context, {
    'x-region': pinnedRegion,
  });
  const unpinnedCatalog = field(unpinned, 'warmCatalog');
  const unpinnedRegions = (field(unpinned, 'regions') ?? {}) as Record<
    string,
    number
  >;
  const choice = regionDecision(
    {
      catalogP50Ms: number(field(unpinnedCatalog, 'p50')),
      regions: unpinnedRegions,
    },
    { catalogP50Ms: pinned.warmCatalog.p50, regions: pinned.regions },
    pinnedRegion,
  );
  const difference = (name: 'p50' | 'p95') => {
    const unpinnedMs = number(field(unpinnedCatalog, name));
    const pinnedMs = pinned.warmCatalog[name];
    return unpinnedMs === null || pinnedMs === null
      ? null
      : pinnedMs - unpinnedMs;
  };
  await context.save('7', {
    pass:
      choice.decision === null || !pinned.everyReplyOk
        ? false
        : context.idleMinutes >= 15
          ? true
          : null,
    summary: `Unpinned regions ${Object.keys(unpinnedRegions).join(', ') || 'unknown'}. Pinned regions ${Object.keys(pinned.regions).join(', ') || 'unknown'}. Region decision: ${choice.decision ?? 'none'} (${choice.why}).`,
    regionDecision: choice.decision,
    regionDecisionWhy: choice.why,
    unpinnedRegions,
    pinnedRegions: pinned.regions,
    warmCatalogDifferenceMs: {
      p50: difference('p50'),
      p95: difference('p95'),
    },
    pinnedSelectOne: selectOne,
    pinnedPredictedSyncWallMs: perfVerdict({
      warmCatalogP95Ms: pinned.warmCatalog.p95,
      firstAfterIdleMs: pinned.firstHealthMs,
      hostedSelectOneMedianMs: selectOne.p50,
    }).predictedSyncWallMs,
    pinned,
  });
}

const lanes: Record<
  (typeof runOrder)[number],
  (context: LaneContext) => Promise<void>
> = {
  '1': lane1,
  '2': lane2,
  '3': lane3,
  '4': lane4,
  '5': lane5,
  '6': lane6AndPerf,
  '7': lane7,
  '8': lane8,
  '9': lane9,
  cpu: cpuLane,
};

export async function runLanes(
  context: LaneContext,
  only: readonly string[] = runOrder,
) {
  for (const lane of runOrder) {
    if (!only.includes(lane)) continue;
    context.log(`Lane ${lane} started.`);
    await lanes[lane](context);
  }
}

/** Lane 10 arrives as the workflow's receipt. It must hold names, never a value or a digest. */
export function deployReceiptVerdict(receipt: Json) {
  const names = field(receipt, 'secretNames');
  const keys: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (typeof value === 'object' && value !== null)
      for (const [key, item] of Object.entries(value)) {
        keys.push(key);
        visit(item);
      }
  };
  visit(receipt);
  const namesOnly =
    Array.isArray(names) &&
    names.every(
      (name) => typeof name === 'string' && /^[A-Z][A-Z0-9_]*$/.test(name),
    ) &&
    !keys.some((key) => /^(value|digest|secret)$/i.test(key));
  return {
    pass: receipt.pass === true && namesOnly,
    holdsSecretNamesOnly: namesOnly,
    sourceSha: text(field(receipt, 'sourceSha')),
  };
}

/** Folds the workflow's log scan into lane 5. A scan for another run proves nothing about this one. */
export function logCanaryVerdict(lane5Receipt: Json, scan: Json) {
  if (field(scan, 'nonce') !== field(lane5Receipt, 'nonce'))
    return {
      pass: null,
      summary: 'The log scan belongs to a different run of lane 5.',
    };
  const verdict = text(field(scan, 'verdict'));
  const reasons = field(scan, 'reasons');
  return {
    pass: verdict === 'clean' ? true : verdict === 'found' ? false : null,
    summary:
      verdict === 'clean'
        ? 'The scan read every log source, found the path marker and found no bearer, header or body canary.'
        : verdict === 'found'
          ? 'A canary appears in the logs. Stop and present the scan to Anthony.'
          : `The scan is inconclusive: ${Array.isArray(reasons) ? reasons.join('; ') : 'no reason given'}. Read the Invocations and Logs views by hand.`,
  };
}

export function renderReport(
  receipts: Partial<Record<LaneId, Json>>,
  generatedAt: string,
) {
  const verdicts = [
    ...numberedLanes.map((lane) => ({
      lane: `lane ${lane}`,
      receipt: receipts[lane],
    })),
    { lane: 'perf rule', receipt: receipts.perf },
  ].map(({ lane, receipt }) => ({
    lane,
    pass: receipt === undefined ? null : ((receipt.pass ?? null) as Verdict),
    summary: text(field(receipt, 'summary')) ?? 'No receipt.',
  }));
  const word = (pass: Verdict) =>
    pass === true ? 'pass' : pass === false ? 'fail' : 'unproven';
  const cpu = receipts.cpu;
  return [
    '# P15-2 hosted runtime trial',
    '',
    `Generated ${generatedAt}. Receipts are in \`.local/swarm/p15-2/\`.`,
    '',
    '| Check | Verdict | Evidence |',
    '| --- | --- | --- |',
    ...verdicts.map(
      ({ lane, pass, summary }) =>
        `| ${lane} | ${word(pass)} | ${summary.replaceAll('|', '/')} |`,
    ),
    '',
    `Client-address header: ${text(field(receipts['4'], 'chosen')) ?? 'none chosen'}.`,
    '',
    `Region decision: ${text(field(receipts['7'], 'regionDecision')) ?? 'none'}${text(field(receipts['7'], 'regionDecisionWhy')) ? ` (${text(field(receipts['7'], 'regionDecisionWhy'))})` : ''}.`,
    '',
    decision(verdicts),
    '',
    `CPU limit, beside the decision and not part of it: ${text(field(cpu, 'summary')) ?? 'not run.'}`,
    '',
  ].join('\n');
}

async function readJson(path: string) {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Json;
  } catch (error) {
    if (field(error, 'code') === 'ENOENT') return undefined;
    throw error;
  }
}

const receiptPath = (lane: LaneId) =>
  resolve(receiptsDir, laneFolder(lane), receiptNames[lane]);

async function saveReceipt(lane: LaneId, receipt: Json) {
  const path = receiptPath(lane);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ lane, savedAt: new Date().toISOString(), ...receipt }, null, 2)}\n`,
  );
  console.log(
    `Saved ${path}: ${String(receipt.pass ?? receipt.conclusion ?? 'pending')}`,
  );
}

async function writeReport() {
  const receipts: Partial<Record<LaneId, Json>> = {};
  for (const lane of Object.keys(receiptNames) as LaneId[]) {
    const receipt = await readJson(receiptPath(lane));
    if (receipt) receipts[lane] = receipt;
  }
  const report = renderReport(receipts, new Date().toISOString());
  await mkdir(trialDir, { recursive: true });
  await writeFile(reportPath, report);
  console.log(report);
  console.log(`Saved ${reportPath}`);
}

async function writeRequest(
  operation: keyof typeof requestFiles,
  request: Json,
) {
  const path = resolve(root, requestFiles[operation]);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(request, null, 2)}\n`);
  console.log(
    `Wrote ${path}. Committing and pushing it to phase15/edge-trial starts the gated ${operation} job, which waits for Anthony's approval.`,
  );
}

function option(args: string[], name: string) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

async function main(args: string[]) {
  const [command, ...rest] = args;
  const requestedAt = new Date().toISOString();
  if (command === 'prepare-deploy') {
    await mkdir(trialDir, { recursive: true });
    let key = await readFile(keyPath, 'utf8').catch(() => '');
    if (!key || rest.includes('--rotate')) {
      key = randomBytes(32).toString('base64url');
      await writeFile(keyPath, key, { mode: 0o600 });
    }
    await writeRequest('deploy', { requestedAt, trialKeySha256: sha256(key) });
    return;
  }
  if (command === 'prepare-delete') {
    await writeRequest('delete', { requestedAt });
    return;
  }
  if (command === 'prepare-logs') {
    const receipt = await readJson(receiptPath('5'));
    const window = field(receipt, 'window');
    if (!receipt || !window) throw new Error('Run lane 5 first');
    await writeRequest('logs', {
      requestedAt,
      from: field(window, 'from'),
      to: field(window, 'to'),
      nonce: receipt.nonce,
    });
    return;
  }
  if (command === 'report') {
    const scanPath = option(rest, '--log-scan');
    if (scanPath) {
      const receipt = await readJson(receiptPath('5'));
      const scan = await readJson(resolve(scanPath));
      if (!receipt || !scan) throw new Error('Lane 5 or its scan is missing');
      await saveReceipt('5', {
        ...receipt,
        ...logCanaryVerdict(receipt, scan),
        scan,
      });
    }
    await writeReport();
    return;
  }
  if (command === 'run') {
    const [functionUrl, workerUrl] = rest;
    if (
      !functionUrl ||
      !/^https:\/\/[a-z]{20}\.supabase\.co\/functions\/v1\/justgo-trial$/.test(
        functionUrl,
      )
    )
      throw new Error(
        'The function URL must be https://<project-ref>.supabase.co/functions/v1/justgo-trial',
      );
    const worker = new URL(workerUrl ?? '');
    if (worker.protocol !== 'https:' || worker.href !== `${worker.origin}/`)
      throw new Error('The Worker URL must be a bare https origin');
    const deployReceiptPath = option(rest, '--deploy-receipt');
    const deployReceipt = deployReceiptPath
      ? await readJson(resolve(deployReceiptPath))
      : undefined;
    if (!deployReceipt)
      throw new Error(
        '--deploy-receipt must name the deploy-readback.json from the workflow artifact',
      );
    const lane10 = deployReceiptVerdict(deployReceipt);
    if (!lane10.sourceSha) throw new Error('The deploy receipt has no source');
    await saveReceipt('10', {
      ...deployReceipt,
      ...lane10,
      summary: `The workflow read back function version ${String(field(field(deployReceipt, 'function'), 'version'))} and a repeat deploy of the same build ${field(field(deployReceipt, 'checks'), 'repeatDeployUnchanged') === true ? 'changed nothing' : 'did not confirm the hash'}. The receipt ${lane10.holdsSecretNamesOnly ? 'holds secret names only' : 'may hold more than names'}.`,
    });
    const only = option(rest, '--only')?.split(',');
    if (only?.some((lane) => !(runOrder as readonly string[]).includes(lane)))
      throw new Error(`--only takes ${runOrder.join(',')}`);
    const idleMinutes = Number(option(rest, '--idle-minutes') ?? '15');
    if (!Number.isFinite(idleMinutes) || idleMinutes < 0)
      throw new Error('--idle-minutes must be a number');
    const trialKey = await readFile(keyPath, 'utf8');
    await runLanes(
      {
        functionUrl,
        workerUrl: worker.origin,
        trialKey,
        nonce: randomBytes(8).toString('hex'),
        expectedSourceSha: lane10.sourceSha,
        macAddress: option(rest, '--mac-address'),
        idleMinutes,
        warmRequests: 50,
        rounds: 50,
        burnsMs: [700, 700, 700, 700, 1500, 2500],
        send: (url, init) => fetch(url, init),
        sleep: (ms) => delay(ms),
        now: () => new Date(),
        log: (line) => console.log(line),
        save: saveReceipt,
        load: (lane) => readJson(receiptPath(lane)),
      },
      only,
    );
    await writeReport();
    return;
  }
  throw new Error(
    'Usage: hosted-lanes.ts prepare-deploy|prepare-delete|prepare-logs|run|report',
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  await main(process.argv.slice(2));
