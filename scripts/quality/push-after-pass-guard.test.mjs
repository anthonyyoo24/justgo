import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  decide,
  evaluate,
  output,
  pushesIn,
  targetsOf,
} from '../../.claude/hooks/push-after-pass-guard.mjs';

const hook = fileURLToPath(
  new URL('../../.claude/hooks/push-after-pass-guard.mjs', import.meta.url),
);

test('pushes are found with their directory, refspecs and acknowledgement', () => {
  assert.deepEqual(pushesIn('git push', '/repo'), [
    { cwd: '/repo', refspecs: [], acknowledged: false },
  ]);
  assert.deepEqual(
    pushesIn(
      'cd sub && git -C ../other push --force-with-lease -o ci.skip origin HEAD:refs/heads/fix',
      '/repo',
    ),
    [
      {
        cwd: '/repo/other',
        refspecs: ['HEAD:refs/heads/fix'],
        acknowledged: false,
      },
    ],
  );
  assert.deepEqual(
    pushesIn('git add . && PUSH_AFTER_PASS=1 git push -u origin fix', '/r'),
    [{ cwd: '/r', refspecs: ['fix'], acknowledged: true }],
  );
  assert.deepEqual(pushesIn('cd ~/x; git push', '/r'), [
    { cwd: `${homedir()}/x`, refspecs: [], acknowledged: false },
  ]);
  assert.deepEqual(pushesIn('git \\\n  push origin "fix"', '/r')[0].refspecs, [
    'fix',
  ]);
});

test('dry runs, deletes, tag pushes and other commands are ignored', () => {
  for (const command of [
    'git push --dry-run',
    'git push -n origin fix',
    'git push origin --delete fix',
    'git push --tags',
    'git status',
    'git log --oneline | grep push',
    'npm run merge:pr -- 3 --head abc --auto',
  ])
    assert.deepEqual(pushesIn(command, '/r'), [], command);
});

test('refspecs name the commit sent and the branch updated', () => {
  assert.deepEqual(targetsOf([], 'fix'), [{ source: 'HEAD', branch: 'fix' }]);
  assert.deepEqual(targetsOf([], undefined), []);
  assert.deepEqual(
    targetsOf(['+abc123:refs/heads/fix', 'other', ':gone', 'HEAD'], 'cur'),
    [
      { source: 'abc123', branch: 'fix' },
      { source: 'other', branch: 'other' },
      { source: 'HEAD', branch: 'cur' },
    ],
  );
});

const pr = { number: 7 };
const pass = { verdict: 'PASS', base: 'b', head: 'h' };
const carries = { status: 0, result: 'carries', changed: [] };
const reverify = { status: 1, result: 're-verify', changed: ['a.ts'] };

test('a code push after a PASS on the head is denied with a way out', () => {
  const decision = decide({
    pr,
    verdict: pass,
    remote: carries,
    pushed: reverify,
    acknowledged: false,
  });
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.reason, /PR #7 has a PASS verdict/);
  assert.match(decision.reason, /changes a\.ts/);
  assert.match(decision.reason, /follow-up PR/);
  assert.match(decision.reason, /npm run merge:pr -- 7 --disable-auto/);
  assert.match(decision.reason, /PUSH_AFTER_PASS=1 git push/);
  assert.equal(output(decision).hookSpecificOutput.permissionDecision, 'deny');
});

test('pushes that keep the verdict, or need a verifier anyway, pass', () => {
  const base = { pr, verdict: pass, remote: carries, pushed: reverify };
  assert.equal(decide({ ...base, acknowledged: true }), undefined);
  assert.equal(
    decide({
      ...base,
      pushed: { status: 0, result: 'docs-tests-only', changed: ['a.md'] },
    }),
    undefined,
  );
  assert.equal(decide({ ...base, pushed: carries }), undefined);
  assert.equal(decide({ ...base, remote: reverify }), undefined);
  assert.equal(
    decide({ ...base, verdict: { ...pass, verdict: 'FAIL' } }),
    undefined,
  );
  assert.equal(decide({ ...base, verdict: undefined }), undefined);
  // A verdict-patch error lets the push through.
  assert.equal(
    decide({ ...base, pushed: { status: 2, result: '', changed: [] } }),
    undefined,
  );
  assert.equal(output(undefined), undefined);
});

function fakeIo({ prs, checks, current = 'fix', sha = 'new' }) {
  const calls = [];
  return {
    calls,
    git(args) {
      calls.push(['git', ...args]);
      if (args[0] === 'symbolic-ref') return `${current}\n`;
      if (args[0] === 'rev-parse') return `${sha}\n`;
      return '';
    },
    gh(args) {
      calls.push(['gh', ...args]);
      if (args[0] === 'pr') return JSON.stringify(prs);
      return `${args[1].split('/').at(-1)}-full\n`;
    },
    check(refs) {
      calls.push(['check', ...refs]);
      return checks[refs.at(-1)];
    },
  };
}

const owner = (body) => ({
  authorAssociation: 'OWNER',
  body,
  url: 'https://example.test/c',
  createdAt: '2026-11-10T00:00:00Z',
});
const passComment = owner(
  'Verifier verdict: PASS on base `bbbbbbb`, head `ccccccc`\nSensitive: no',
);

test('evaluate checks the remote head and the pushed commit against the verdict', () => {
  const io = fakeIo({
    prs: [
      {
        number: 9,
        headRefOid: 'old',
        baseRefName: 'main',
        comments: [passComment],
      },
    ],
    checks: {
      old: { status: 0, stdout: 'carries\n' },
      new: { status: 1, stdout: 're-verify\n  apps/x.ts\n' },
    },
  });
  const decision = evaluate('git push', '/r', io);
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.reason, /PR #9/);
  assert.match(decision.reason, /changes apps\/x\.ts/);
  assert.deepEqual(
    io.calls.filter((call) => call[0] === 'check'),
    [
      ['check', 'bbbbbbb-full', 'ccccccc-full', 'origin/main', 'old'],
      ['check', 'bbbbbbb-full', 'ccccccc-full', 'origin/main', 'new'],
    ],
  );
  assert.ok(
    io.calls.some(
      (call) =>
        call[0] === 'git' &&
        call[1] === 'fetch' &&
        call.includes('old') &&
        call.includes('ccccccc-full'),
    ),
  );
});

test('evaluate lets through pushes with no PR, no PASS, or no new commit', () => {
  const checks = {
    old: { status: 0, stdout: 'carries\n' },
    new: { status: 1, stdout: 're-verify\n  a.ts\n' },
  };
  assert.equal(
    evaluate('git push', '/r', fakeIo({ prs: [], checks })),
    undefined,
  );
  const noPass = fakeIo({
    prs: [{ number: 9, headRefOid: 'old', baseRefName: 'main', comments: [] }],
    checks,
  });
  assert.equal(evaluate('git push', '/r', noPass), undefined);
  assert.ok(!noPass.calls.some((call) => call[0] === 'check'));
  const same = fakeIo({
    prs: [
      {
        number: 9,
        headRefOid: 'new',
        baseRefName: 'main',
        comments: [passComment],
      },
    ],
    checks,
  });
  assert.equal(evaluate('git push', '/r', same), undefined);
  assert.equal(evaluate('ls', '/r', fakeIo({ prs: [], checks })), undefined);
});

test('the hook stays silent for commands that are not pushes', () => {
  const result = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'git status' },
      cwd: '/',
    }),
    encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});
