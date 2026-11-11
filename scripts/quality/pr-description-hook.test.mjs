import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { check, targets } from '../../.claude/hooks/pr-description-check.mjs';

const hook = fileURLToPath(
  new URL('../../.claude/hooks/pr-description-check.mjs', import.meta.url),
);
const settings = JSON.parse(
  readFileSync(new URL('../../.claude/settings.json', import.meta.url), 'utf8'),
);

const good = [
  '## Why',
  'The reason.',
  '## What changed',
  '- A change.',
  '## Scope',
  '- What it leaves out.',
  '## Verification',
  '- A real run.',
].join('\n');
const url = 'https://github.com/o/r/pull/248';

// A fake `gh` on PATH. It records its arguments and answers `pr view` with
// FAKE_BODY, or fails when FAKE_FAIL is set.
function fakeGh(t) {
  const dir = mkdtempSync(join(tmpdir(), 'pr-description-hook-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const calls = join(dir, 'calls.txt');
  const script = join(dir, 'fake-gh.cjs');
  writeFileSync(
    script,
    `const { appendFileSync } = require('node:fs');
appendFileSync(${JSON.stringify(calls)}, process.argv.slice(2).join(' ') + '\\n');
if (process.env.FAKE_FAIL) { process.stderr.write('gh: HTTP 502'); process.exit(1); }
const ref = process.argv[4]?.startsWith('-') ? undefined : process.argv[4];
const number = Number(String(ref ?? '7').match(/\\d+$/)[0]);
process.stdout.write(JSON.stringify({ number, url: 'https://github.com/o/r/pull/' + number, body: process.env.FAKE_BODY }));
`,
  );
  writeFileSync(
    join(dir, 'gh'),
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"\n`,
  );
  chmodSync(join(dir, 'gh'), 0o755);
  const run = (command, { stdout = '', body = good, fail = false } = {}) => {
    rmSync(calls, { force: true });
    const result = spawnSync(process.execPath, [hook], {
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command },
        tool_response: { stdout, stderr: '', interrupted: false },
        cwd: dir,
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        FAKE_BODY: body,
        ...(fail ? { FAKE_FAIL: '1' } : {}),
      },
    });
    let ghCalls = [];
    try {
      ghCalls = readFileSync(calls, 'utf8').trim().split('\n');
    } catch {
      // No call was made.
    }
    return {
      status: result.status,
      stderr: result.stderr,
      output: result.stdout ? JSON.parse(result.stdout) : undefined,
      ghCalls,
    };
  };
  return run;
}

const create = `gh pr create --title "x" --body "$(cat <<'EOF'\n## Summary\nEOF\n)"`;

test('a good body after gh pr create passes silently', (t) => {
  const run = fakeGh(t);
  const result = run(create, { stdout: `${url}\n` });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, undefined);
  assert.deepEqual(result.ghCalls, [`pr view ${url} --json number,url,body`]);
});

test('each missing required section feeds the fix and the order back', (t) => {
  const run = fakeGh(t);
  for (const [section, fix] of [
    ['## Why\nThe reason.\n', 'Add a "## Why" section.'],
    ['## Scope\n- What it leaves out.\n', 'Add a "## Scope" section.'],
    ['## Verification\n- A real run.', 'Add a "## Verification" section.'],
  ]) {
    const result = run(create, {
      stdout: url,
      body: good.replace(section, ''),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.output.decision, 'block', section);
    assert.match(result.output.reason, new RegExp(`PR #248 \\(${url}\\)`));
    assert.ok(result.output.reason.includes(`- ${fix}`), result.output.reason);
    assert.match(
      result.output.reason,
      /in order: ## Why, ## What changed \(optional\), ## Scope, ## Tradeoffs \(optional\), ## Blast Radius \(optional\), ## Verification\./,
    );
    assert.match(result.output.reason, /Fix the description now/);
  }
  // PR #248's original headings.
  const pr248 = run(create, {
    stdout: url,
    body: '## Summary\nx\n## Why\ny\n## Checks\nz',
  });
  assert.match(pr248.output.reason, /Add a "## Scope" section\./);
  assert.match(pr248.output.reason, /Add a "## Verification" section\./);
});

test('gh pr edit is checked by its number, URL or the current branch', (t) => {
  const run = fakeGh(t);
  const bad = '## Summary\nx';
  const byNumber = run(`gh pr edit 248 --body-file /tmp/body.md`, {
    body: bad,
  });
  assert.deepEqual(byNumber.ghCalls, ['pr view 248 --json number,url,body']);
  assert.equal(byNumber.output.decision, 'block');
  assert.match(byNumber.output.reason, /PR #248/);
  const byRepo = run('gh -R o/r pr edit #12 --title t');
  assert.deepEqual(byRepo.ghCalls, [
    'pr view 12 --repo o/r --json number,url,body',
  ]);
  assert.equal(byRepo.output, undefined);
  const printed = run('gh pr edit --add-label x', { stdout: `${url}\n` });
  assert.deepEqual(printed.ghCalls, [`pr view ${url} --json number,url,body`]);
  const branch = run('cd x && gh pr edit --body-file b.md', { body: bad });
  assert.deepEqual(branch.ghCalls, ['pr view --json number,url,body']);
  assert.equal(branch.output.decision, 'block');
});

test('commands that create or edit no PR are ignored without calling gh', (t) => {
  const run = fakeGh(t);
  for (const command of [
    'ls',
    'gh pr view 248 --json body',
    'gh pr list',
    "grep -n 'gh pr create' AGENTS.md",
    'git commit -m "docs: run gh pr edit after a change"',
    'pnpm run merge:pr 248 --head abc --auto',
  ]) {
    const result = run(command, { stdout: url });
    assert.equal(result.output, undefined, command);
    assert.deepEqual(result.ghCalls, [], command);
  }
  assert.equal(targets('gh issue create --title x'), undefined);
});

test('a failing gh says the check did not run and blocks nothing', (t) => {
  const run = fakeGh(t);
  const result = run('gh pr edit 248 --body-file b.md', { fail: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output.decision, undefined);
  assert.equal(result.output.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(
    result.output.hookSpecificOutput.additionalContext,
    /could not read 248 \(gh: HTTP 502\).*did not check/,
  );
});

test('a bad PR and an unreadable PR in one command report both', () => {
  const result = check(
    'gh pr create --fill',
    'https://github.com/o/r/pull/1\nhttps://github.com/o/r/pull/2',
    ({ ref }) => {
      if (ref.endsWith('/2')) throw new Error('gh: not found');
      return { number: 1, url: ref, body: '' };
    },
  );
  assert.equal(result.decision, 'block');
  assert.match(result.reason, /PR #1 .*\n- Add a "## Why" section\./);
  assert.match(result.reason, /could not read .*pull\/2 \(gh: not found\)/);
});

test('settings run the hook after Bash without blocking on its failure', () => {
  const entries = settings.hooks.PostToolUse.filter(
    (entry) => entry.matcher === 'Bash',
  ).flatMap((entry) => entry.hooks);
  const entry = entries.find((one) =>
    one.command.includes('.claude/hooks/pr-description-check.mjs'),
  );
  assert.ok(entry, 'pr-description-check is registered');
  assert.equal(entry.onFailure, undefined);
});
