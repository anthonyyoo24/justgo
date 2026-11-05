import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { journeyEnvironment } from '../../../../e2e/support/environment';
import journeys from '../../../../e2e/playwright.config';
// @ts-expect-error The journey port helper is untyped Node tooling.
import { assertJourneyPortsAvailable } from '../../../../scripts/journeys/journey-ports.mjs';

type Serving = {
  runId: string;
  root: string;
  servers: { name: string; pid: number; url: string; log: string }[];
};

const root = process.cwd();
const statePath = path.join(root, '.local/verify-justgo/serving.json');

function readServing(): Serving | undefined {
  return existsSync(statePath)
    ? (JSON.parse(readFileSync(statePath, 'utf8')) as Serving)
    : undefined;
}

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopGroups(pids: number[]) {
  for (const pid of pids) if (alive(pid)) process.kill(-pid, 'SIGTERM');
  for (let waited = 0; waited < 15_000; waited += 250) {
    if (!pids.some(alive)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  for (const pid of pids) if (alive(pid)) process.kill(-pid, 'SIGKILL');
}

async function waitUntilServing(url: string, timeout: number, pid: number) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (!alive(pid))
      throw new Error(`Service for ${url} exited during startup`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      if (response.status < 400) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Service for ${url} was not ready within ${timeout} ms`);
}

async function start(runId: string) {
  const current = readServing();
  if (current)
    throw new Error(
      `Run ${current.runId} already serves this checkout; run bin/verify stop first`,
    );
  journeyEnvironment(process.env);
  await assertJourneyPortsAvailable();
  for (const script of ['build:contracts', 'db:migrate']) {
    const result = spawnSync('npm', ['run', script], {
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status !== 0) throw new Error(`npm run ${script} failed`);
  }
  const runDir = path.join(root, '.local/verify-justgo', runId);
  mkdirSync(runDir, { recursive: true });
  const serving: Serving = { runId, root, servers: [] };
  try {
    for (const server of [journeys.webServer ?? []].flat()) {
      if (!server.command || !server.url) continue;
      const name = server.name ?? server.command;
      const log = path.join(
        runDir,
        `${name.toLowerCase().replace(/\W+/g, '-')}.log`,
      );
      const output = openSync(log, 'a');
      // The same commands and environment the saved journeys use. Diagnostics
      // stay off because no Playwright route intercepts Sentry in the pane.
      const child = spawn(server.command, {
        cwd: root,
        shell: true,
        detached: true,
        stdio: ['ignore', output, output],
        env: {
          ...process.env,
          ...server.env,
          EXPO_PUBLIC_SENTRY_ENABLED: 'false',
        },
      });
      if (!child.pid) throw new Error(`${name} did not start`);
      child.unref();
      serving.servers.push({ name, pid: child.pid, url: server.url, log });
      await writeFile(statePath, `${JSON.stringify(serving, null, 2)}\n`);
      await waitUntilServing(server.url, server.timeout ?? 60_000, child.pid);
      console.info(`${name} ready at ${server.url}`);
    }
  } catch (error) {
    await stopGroups(serving.servers.map(({ pid }) => pid));
    rmSync(statePath, { force: true });
    throw error;
  }
  console.info(`Serving run ${runId}. Logs are in ${runDir}`);
}

async function stop() {
  const serving = readServing();
  if (!serving) {
    console.info('No instance served by bin/verify serve');
    return;
  }
  await stopGroups(serving.servers.map(({ pid }) => pid));
  await assertJourneyPortsAvailable();
  rmSync(statePath, { force: true });
  console.info(`Stopped run ${serving.runId}; its evidence stays in place`);
}

const [command, runId = ''] = process.argv.slice(2);
try {
  if (command === 'start' && /^[A-Za-z0-9-]{1,80}$/.test(runId))
    await start(runId);
  else if (command === 'stop') await stop();
  else throw new Error('Usage: serve.ts start <run-id> | stop');
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
