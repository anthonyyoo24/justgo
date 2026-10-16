import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/ci.yml', import.meta.url),
  'utf8',
);
const rootPackage = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url)),
);
const [triggers] = workflow.split(/^permissions:$/m);
const jobs = Object.fromEntries(
  workflow
    .split(/^jobs:$/m)[1]
    .split(/^ {2}(?=[\w-]+:$)/m)
    .slice(1)
    .map((job) => [job.slice(0, job.indexOf(':')), job]),
);
// Single-line run commands, from both `- run:` steps and named steps.
const runs = (job) =>
  [...job.matchAll(/^ {6}(?:- | {2})run: (.+)$/gm)].map((match) => match[1]);

test('pushes run only for main while pull requests and a weekly schedule remain', () => {
  assert.match(triggers, /^ {2}push:\n {4}branches: \[main\]$/m);
  assert.match(triggers, /^ {2}pull_request:$/m);
  assert.match(triggers, /^ {2}schedule:\n {4}- cron: '0 13 \* \* 1'$/m);
});

test('newer pull-request runs cancel older ones without grouping main commits together', () => {
  assert.match(workflow, /^ {2}cancel-in-progress: true$/m);
  const group = workflow.match(/^ {2}group: (.+)$/m)?.[1];
  assert.ok(group, 'concurrency needs a group');
  assert.match(group, /github\.event\.pull_request\.number \|\| github\.sha/);
  assert.match(group, /github\.event_name/);
});

test('Expo Doctor is its own job and the scheduled run checks only Doctor', () => {
  assert.deepEqual(Object.keys(jobs), ['expo-doctor', 'checks']);
  assert.ok(
    runs(jobs['expo-doctor']).includes('npm run doctor -w @justgo/mobile'),
  );
  assert.doesNotMatch(jobs['expo-doctor'], /^ {4}if:/m);
  assert.doesNotMatch(jobs['expo-doctor'], /continue-on-error/);
  assert.match(jobs.checks, /^ {4}if: github\.event_name != 'schedule'$/m);
  assert.doesNotMatch(jobs.checks, /needs:/);
});

test('each unit and database suite runs once, through coverage', () => {
  const commands = runs(jobs.checks);
  assert.ok(commands.includes('npm run check:static'));
  assert.ok(commands.includes('npm run test:coverage'));
  assert.ok(commands.includes('npm run db:migrate'));
  for (const command of commands) {
    assert.doesNotMatch(command, /npm run check($| )/);
    assert.doesNotMatch(command, /npm (run )?test($| )|test:db|doctor/);
  }
  assert.doesNotMatch(
    rootPackage.scripts['check:static'],
    /doctor|--workspaces|test:db|test:coverage/,
  );
  assert.match(rootPackage.scripts['test:coverage'], /--workspaces/);
});

test('the local check still runs Doctor, the static checks and every workspace test', () => {
  assert.equal(
    rootPackage.scripts.check,
    'npm run doctor -w @justgo/mobile && npm run check:static && npm run test --workspaces',
  );
  assert.match(
    rootPackage.scripts['check:static'],
    /npm run test:architecture$/,
  );
});
