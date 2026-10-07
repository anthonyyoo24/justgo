import { spawn } from 'node:child_process';
import { journeyEnvironment } from '../../e2e/support/environment.ts';

// Validate before either migration or fixture server starts. Never print URL values.
journeyEnvironment(process.env);

// Playwright supplies FORCE_COLOR to its children; do not forward a conflicting flag.
const childEnvironment = { ...process.env };
delete childEnvironment.NO_COLOR;

async function run(command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    env: childEnvironment,
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (status) => resolve(status ?? 1));
  });
  if (code !== 0) process.exit(Number(code));
}

await run('npm', ['run', 'build:contracts']);
await run('npm', ['run', 'db:migrate']);
await run('node', ['scripts/journeys/build-journey-repository.mjs']);
await run('npx', [
  'playwright',
  'test',
  '--config=e2e/playwright.config.ts',
  ...process.argv.slice(2),
]);
