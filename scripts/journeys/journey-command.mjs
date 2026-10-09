import { spawn } from 'node:child_process';
import { journeyEnvironment } from '../../e2e/support/environment.ts';
import { assertJourneyPortsAvailable } from './journey-ports.mjs';

/**
 * Run a child with inherited output and return its exit status.
 * Signals become status 1; process-start errors reject instead of reporting success.
 */
async function runCommand(command, args, env) {
  const child = spawn(command, args, { stdio: 'inherit', env });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (status) => resolve(status ?? 1));
  });
}

/**
 * Run the guarded contract/migration/build/Playwright pipeline in order.
 * Validate the test environment and free fixture ports before any command runs;
 * stop on the first nonzero status and forward caller arguments only to Playwright.
 */
export async function runJourney({
  args = [],
  environment = process.env,
  checkPorts = assertJourneyPortsAvailable,
  run = runCommand,
} = {}) {
  // Validate before either migration or fixture server starts. Never print URLs.
  journeyEnvironment(environment);
  await checkPorts();
  const childEnvironment = { ...environment };
  // Playwright supplies FORCE_COLOR to its children; omit the conflicting flag.
  delete childEnvironment.NO_COLOR;
  for (const [command, commandArgs] of [
    ['npm', ['run', 'build:contracts']],
    ['npm', ['run', 'db:migrate']],
    ['node', ['scripts/journeys/build-journey-repository.mjs']],
    [
      'npx',
      ['playwright', 'test', '--config=e2e/playwright.config.ts', ...args],
    ],
  ]) {
    const code = await run(command, commandArgs, childEnvironment);
    if (code !== 0) return code;
  }
  return 0;
}
