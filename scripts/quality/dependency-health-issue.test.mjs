import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { issueTitle, reportFailure } from './dependency-health-issue.mjs';

const workflow = readFileSync(
  new URL('../../.github/workflows/dependency-health.yml', import.meta.url),
  'utf8',
);
const runUrl = 'https://github.com/owner/justgo/actions/runs/7';

function fakeGh(issues) {
  const calls = [];
  const gh = (args) => {
    calls.push(args);
    return args[1] === 'list' ? JSON.stringify(issues) : '';
  };
  return { gh, calls };
}

test('a failure opens the issue when none with the exact title is open', () => {
  const { gh, calls } = fakeGh([{ number: 3, title: `${issueTitle} again` }]);
  assert.deepEqual(reportFailure({ runUrl, gh }), { action: 'opened' });
  const create = calls.at(-1);
  assert.deepEqual(create.slice(0, 4), [
    'issue',
    'create',
    '--title',
    issueTitle,
  ]);
  assert.match(create[5], new RegExp(runUrl));
  assert.equal(calls.length, 2);
});

test('a later failure comments on the open issue instead of opening another', () => {
  const { gh, calls } = fakeGh([{ number: 9, title: issueTitle }]);
  assert.deepEqual(reportFailure({ runUrl, gh }), {
    action: 'commented',
    number: 9,
  });
  assert.deepEqual(calls.at(-1).slice(0, 3), ['issue', 'comment', '9']);
  assert.ok(!calls.some((args) => args[1] === 'create'));
});

test('a missing run URL stops before any request', () => {
  const { gh, calls } = fakeGh([]);
  assert.throws(() => reportFailure({ runUrl: '', gh }), /RUN_URL/);
  assert.deepEqual(calls, []);
});

test('the daily workflow runs live Doctor and the audit on main and reports a failure', () => {
  assert.match(workflow, /^ {2}schedule:\n {4}- cron: '[\d* ]+'$/m);
  assert.match(workflow, /^ {2}workflow_dispatch:$/m);
  assert.doesNotMatch(workflow, /pull_request/);
  assert.match(workflow, /^ {4}if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(workflow, /^permissions:\n {2}contents: read$/m);
  assert.match(workflow, /^ {6}issues: write$/m);
  const runs = [...workflow.matchAll(/^ {8}run: (.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(runs, [
    'pnpm --filter @justgo/mobile run doctor',
    'pnpm run audit:api',
    'node scripts/quality/dependency-health-issue.mjs',
  ]);
  // The audit still runs after a Doctor failure, and only a failure reports.
  assert.match(workflow, /run: pnpm run audit:api/);
  assert.match(
    workflow,
    /if: \$\{\{ !cancelled\(\) \}\}\n {8}run: pnpm run audit:api/,
  );
  assert.match(
    workflow,
    /if: failure\(\)\n[\s\S]*run: node scripts\/quality\/dependency-health-issue\.mjs/,
  );
});
