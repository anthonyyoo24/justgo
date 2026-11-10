// Read-only: reports whether this checkout's JustGO instance is worth driving.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import {
  journeyApiUrl,
  journeyAppApiUrl,
  journeyAppUrl,
  journeyEnvironment,
} from '../../../../e2e/support/environment';

const root = process.cwd();
const problems: string[] = [];
const sh = (command: string, args: string[]) => {
  try {
    return execFileSync(command, args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
};

const checkout = {
  root,
  head: sh('git', ['rev-parse', '--short', 'HEAD']),
  branch: sh('git', ['branch', '--show-current']),
  changedFiles: sh('git', ['status', '--porcelain']).split('\n').filter(Boolean)
    .length,
};

let migrationUrl: string | undefined;
try {
  migrationUrl = journeyEnvironment(process.env).migrationUrl;
} catch (error) {
  problems.push(`environment: ${(error as Error).message}`);
}

async function database(required: boolean) {
  if (!migrationUrl) return { reachable: false };
  const pool = new Pool({ connectionString: migrationUrl, max: 1, ssl: false });
  try {
    const registered = (
      JSON.parse(
        readFileSync('apps/api/drizzle/meta/_journal.json', 'utf8'),
      ) as { entries: { tag: string; when: number }[] }
    ).entries.at(-1);
    const { rows } = await pool.query<{
      role: string;
      applied: string | null;
      users: number;
      attempts: number;
    }>(`select current_user as role,
        (select max(created_at)::text from drizzle.__drizzle_migrations) as applied,
        (select count(*)::int from justgo.users) as users,
        (select count(*)::int from justgo.attempts) as attempts`);
    const [row] = rows;
    const applied = Number(row?.applied ?? 0);
    const migrations =
      applied === registered?.when
        ? 'current'
        : applied > (registered?.when ?? 0)
          ? 'ahead of this checkout'
          : 'pending';
    if (migrations === 'ahead of this checkout')
      problems.push(
        'database: applied migrations are newer than this checkout; another branch migrated justgo_test',
      );
    return {
      reachable: true,
      role: row?.role,
      latestRegistered: registered?.tag,
      migrations,
      users: row?.users,
      attempts: row?.attempts,
    };
  } catch {
    // Before launch a stopped database is expected; drive and serve start it.
    if (required) problems.push('database: unreachable or not migrated');
    return { reachable: false };
  } finally {
    await pool.end();
  }
}

function listeners(url: string) {
  const { port } = new URL(url);
  return sh('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    .split('\n')
    .filter(Boolean)
    .map(Number)
    .map((pid) => ({
      pid,
      group: Number(sh('ps', ['-o', 'pgid=', '-p', String(pid)])),
      cwd: sh('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
        .split('\n')
        .find((line) => line.startsWith('n'))
        ?.slice(1),
    }));
}

async function get(url: string, timeout = 10_000) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout) });
    return { status: response.status, body: await response.text() };
  } catch {
    return { status: 0, body: '' };
  }
}

const statePath = '.local/verify-justgo/serving.json';
const serving = existsSync(statePath)
  ? (JSON.parse(readFileSync(statePath, 'utf8')) as {
      runId: string;
      servers: { pid: number }[];
    })
  : undefined;
const ownedGroups = new Set(serving?.servers.map(({ pid }) => pid));

function hostedOrigins() {
  // Saved mobile dotenv origins, including .env.local, that must never be served.
  const folder = 'apps/mobile';
  return readdirSync(folder)
    .filter((name) => name.startsWith('.env') && !name.endsWith('.example'))
    .flatMap((name) =>
      [
        ...readFileSync(path.join(folder, name), 'utf8').matchAll(
          /^EXPO_PUBLIC_API_URL=(\S+)/gm,
        ),
      ].map((match) => {
        try {
          return new URL(match[1]!).origin;
        } catch {
          return '';
        }
      }),
    )
    .filter(
      (origin) => origin && !/\/\/(127\.0\.0\.1|localhost)[:/]/.test(origin),
    );
}

async function app() {
  const page = await get(`${journeyAppUrl}/recovery`);
  const script = /<script src="([^"]+\.bundle\?[^"]+)"/.exec(page.body)?.[1];
  if (!script) return { status: page.status };
  // The first request compiles the bundle; allow Metro's cold build time.
  const bundle = await get(new URL(script, journeyAppUrl).href, 180_000);
  const env = (name: string) =>
    new RegExp(`"${name}": \\{ enumerable: true, value: "([^"]*)" \\}`).exec(
      bundle.body,
    )?.[1];
  const leaked = hostedOrigins().filter((origin) =>
    bundle.body.includes(origin),
  );
  return {
    status: page.status,
    bundle: bundle.status,
    apiOrigin: env('EXPO_PUBLIC_API_URL'),
    servedProject: env('EXPO_PUBLIC_PROJECT_ROOT'),
    journeyFixtures: bundle.body.includes('EXPO_PUBLIC_JUSTGO_JOURNEY_FIXTURE'),
    hostedOriginsInBundle: leaked.length,
  };
}

const services = {
  api: listeners(journeyApiUrl),
  app: listeners(journeyAppUrl),
};
const busy = services.api.length + services.app.length > 0;
const report: Record<string, unknown> = {
  checkout,
  database: await database(busy || !!serving),
  serving: serving?.runId ?? null,
  ports: services,
};

if (!busy && !serving) report.state = 'idle';
else {
  const foreign = [...services.api, ...services.app].filter(
    ({ group, cwd }) => !ownedGroups.has(group) || !cwd?.startsWith(root),
  );
  if (foreign.length)
    problems.push(
      'ports: a process this skill did not start owns a fixture port; do not drive or kill it',
    );
  const ready = await get(`${journeyApiUrl}/ready`);
  const registry = await get(`${journeyApiUrl}/__fixtures/accounts`);
  report.api = {
    ready: ready.status,
    fixtureServer: registry.status === 200,
    registeredAccounts:
      registry.status === 200
        ? (JSON.parse(registry.body) as { userIds: string[] }).userIds.length
        : null,
  };
  if (ready.status !== 200 || registry.status !== 200)
    problems.push('api: not the ready fixture API (npm run dev:challenges)');
  const served = await app();
  report.app = served;
  if (served.bundle !== 200) problems.push('app: Metro did not serve a bundle');
  else {
    if (served.apiOrigin !== journeyAppApiUrl)
      problems.push(`app: bundle API origin is not ${journeyAppApiUrl}`);
    if (served.servedProject !== path.join(root, 'apps/mobile'))
      problems.push('app: Metro serves a different checkout');
    if (!served.journeyFixtures)
      problems.push('app: bundle lacks the guarded journey environment');
    if (served.hostedOriginsInBundle)
      problems.push('app: a saved hosted API origin is in the bundle');
  }
  report.state = problems.length ? 'broken' : 'serving';
}
if (problems.length) report.state = 'broken';
report.problems = problems;
console.info(JSON.stringify(report, null, 2));
process.exitCode = problems.length ? 1 : 0;
