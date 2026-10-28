import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const workflow = readFileSync(
  new URL('../../.github/workflows/staging-health.yml', import.meta.url),
  'utf8',
);
const match = workflow.match(/^ {8}run: \|\n((?: {10}.*(?:\n|$))+)/m);
assert.ok(match, 'Missing readiness check');
const script = match[1]
  .trimEnd()
  .split('\n')
  .map((line) => line.slice(10))
  .join('\n');

test('the manual diagnostic uses only public readiness while Sentry owns recurring checks', () => {
  assert.match(workflow, /^ {2}workflow_dispatch:$/m);
  assert.doesNotMatch(workflow, /^ {2}(?:schedule|push|pull_request):/m);
  assert.match(workflow, /^permissions: \{\}$/m);
  assert.match(
    workflow,
    /github\.repository == 'anthonyyoo24\/justgo' && github\.ref == 'refs\/heads\/main'/,
  );
  assert.match(workflow, /timeout-minutes: 2/);
  assert.match(
    workflow,
    /test_notification:\n {8}description:[^\n]+\n {8}type: boolean\n {8}default: false/,
  );
  assert.ok(
    workflow.includes(
      "NOTIFICATION_TEST: ${{ github.event_name == 'workflow_dispatch' && inputs.test_notification && 'true' || 'false' }}",
    ),
  );
  assert.match(
    script,
    /curl --fail --silent --show-error --max-time 15 --retry 2/,
  );
  assert.deepEqual(
    [...script.matchAll(/https:\/\/[^'\s]+/g)].map((value) => value[0]),
    ['https://justgo-two.vercel.app/ready'],
  );
  assert.doesNotMatch(
    workflow,
    /secrets\.|github\.token|checkout|authorization|--location|upload-artifact/i,
  );
});

function check(context, body, curlStatus = '0', notificationTest = 'false') {
  const directory = mkdtempSync(join(tmpdir(), 'justgo-health-'));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(
    join(directory, 'curl'),
    `#!/bin/sh
set -eu
printf '%s' called > "$CURL_TRACE"
if [ "$CURL_STATUS" != 0 ]; then exit "$CURL_STATUS"; fi
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output' ]; then shift; destination="$1"; fi
  shift
done
printf '%s' "$FIXTURE_BODY" > "$destination"
`,
    { mode: 0o700 },
  );
  const result = spawnSync('bash', ['-c', script], {
    env: {
      ...process.env,
      PATH: `${directory}:${process.env.PATH}`,
      RUNNER_TEMP: directory,
      CURL_STATUS: curlStatus,
      CURL_TRACE: join(directory, 'curl-called'),
      FIXTURE_BODY: body,
      NOTIFICATION_TEST: notificationTest,
    },
    encoding: 'utf8',
  });
  const curlCalled = existsSync(join(directory, 'curl-called'));
  assert.deepEqual(
    readdirSync(directory).sort(),
    curlCalled ? ['curl', 'curl-called'] : ['curl'],
    'Response temporary file must be removed',
  );
  return { ...result, curlCalled };
}

test('the executable monitor accepts ready JSON and fails safely for outages or unexpected responses', (context) => {
  assert.equal(check(context, '{ "status": "ready" }').status, 0);
  const privateValue = 'private-provider-fixture';
  for (const body of [
    '{"status":"unavailable"}',
    JSON.stringify({ status: 'ready', message: privateValue }),
    `<html>${privateValue}</html>`,
    'null',
  ]) {
    const result = check(context, body);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Staging readiness failed/);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      new RegExp(privateValue),
    );
  }
  assert.equal(check(context, '', '28').status, 28);
});

test('the explicit notification test fails safely without touching the server', (context) => {
  const result = check(context, '', '0', 'true');
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Synthetic notification-delivery test/);
  assert.match(result.stdout, /no readiness request was made/);
  assert.equal(result.curlCalled, false);
});
