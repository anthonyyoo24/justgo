import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  decide,
  evaluate,
  newCodeFiles,
  output,
  pushesIn,
  shellText,
  targetsOf,
} from '../../.claude/hooks/push-after-pass-guard.mjs';

const hook = fileURLToPath(
  new URL('../../.claude/hooks/push-after-pass-guard.mjs', import.meta.url),
);

const found = (cwd, refspecs = [], extra = {}) => ({
  cwd,
  refspecs,
  acknowledged: false,
  branch: undefined,
  afterChange: false,
  ...extra,
});

test('pushes are found with their directory, refspecs and acknowledgement', () => {
  assert.deepEqual(pushesIn('git push', '/repo'), [found('/repo')]);
  assert.deepEqual(
    pushesIn(
      'cd sub && git -C ../other push --force-with-lease -o ci.skip origin HEAD:refs/heads/fix',
      '/repo',
    ),
    [found('/repo/other', ['HEAD:refs/heads/fix'])],
  );
  assert.deepEqual(
    pushesIn('git add . && PUSH_AFTER_PASS=1 git push -u origin fix', '/r'),
    [found('/r', ['fix'], { acknowledged: true })],
  );
  assert.deepEqual(pushesIn('cd ~/x; git push', '/r'), [
    found(`${homedir()}/x`),
  ]);
  assert.deepEqual(pushesIn('git \\\n  push origin "fix"', '/r')[0].refspecs, [
    'fix',
  ]);
  assert.deepEqual(pushesIn("cd 'a dir' && git push", '/r'), [
    found('/r/__quoted__'),
  ]);
});

test('a push after a commit, merge or rebase in the same command is marked', () => {
  for (const step of [
    'git commit -m fix',
    'git merge origin/main',
    'git rebase --onto origin/main abc',
    'git -C sub cherry-pick abc',
    'git pull --ff-only',
    'git reset --hard origin/fix',
  ])
    assert.equal(
      pushesIn(`${step} && git push`, '/r')[0].afterChange,
      true,
      step,
    );
  assert.equal(
    pushesIn('git push && git commit -m x', '/r')[0].afterChange,
    false,
  );
});

test('a branch switch before the push names the branch it pushes', () => {
  assert.equal(
    pushesIn('git checkout -b new && git push -u origin HEAD', '/r')[0].branch,
    'new',
  );
  assert.equal(pushesIn('git switch -c new; git push', '/r')[0].branch, 'new');
  assert.equal(pushesIn('git checkout fix && git push', '/r')[0].branch, 'fix');
  assert.equal(
    pushesIn('git checkout -- a.ts && git push', '/r')[0].branch,
    undefined,
  );
  assert.equal(
    pushesIn('git checkout new && cd ../b && git push', '/r')[0].branch,
    undefined,
  );
});

test('push text inside messages, heredocs and PR bodies is not a push', () => {
  for (const command of [
    'git commit -m "then git push; git push origin fix"',
    "gh pr create --title x --body 'run git push && git push'",
    "git commit -F - <<'EOF'\nfix: guard\n\ngit push origin fix\nEOF",
    'cat <<EOF > note.md\ngit push\nEOF\necho done',
  ])
    assert.deepEqual(pushesIn(command, '/r'), [], command);
  assert.equal(shellText('echo "a b" fix'), 'echo __quoted__ fix');
  assert.deepEqual(
    pushesIn('git commit -F - <<EOF\nmsg\nEOF\ngit push', '/r'),
    [found('/r', [], { afterChange: true })],
  );
});

// #405: each `<<` once scanned to the end of the text for its closing tag.
test('shellText reads many heredoc openers in linear time', () => {
  for (const text of [
    '<<EOF\n'.repeat(40_000),
    Array.from({ length: 40_000 }, (_, n) => `<<T${n}\n`).join(''),
    '<<EOF'.repeat(40_000),
    'A\n<<A\n'.repeat(40_000),
    `${'<<EOF '.repeat(200_000)}\n`,
  ]) {
    const start = performance.now();
    shellText(text);
    assert.ok(performance.now() - start < 250, text.slice(0, 12));
  }
});

test('a heredoc ends only at a line with its whole tag', () => {
  assert.equal(
    shellText('cat <<EOFX\nx\nEOF\ncat <<A\ngit push\nA\necho y'),
    'cat <<EOFX\nx\nEOF\ncat  \necho y',
  );
  assert.equal(shellText('cat <<A <<B\na\nB\nA\nnext'), 'cat   <<B\nnext');
});

// #421: an empty heredoc closes on the next line
test('an empty heredoc does not hide the commands after it', () => {
  assert.match(
    shellText('cat <<EOF\nEOF\ngit commit -am x && git push\nEOF'),
    /git push/,
  );
});

// #422: cases for withoutHeredocs() that #420's verifier found missing.
test('a closing tag line may end in blanks', () => {
  assert.equal(
    shellText('cat <<EOF\ngit push\nEOF \t\necho y'),
    'cat  \necho y',
  );
});

test('an opener inside a heredoc body is data, not a second heredoc', () => {
  assert.equal(shellText('cat <<A\n<<B\nA\ngit push\nB'), 'cat  \ngit push\nB');
});

test('dry runs, deletes, tag pushes and other commands are ignored', () => {
  for (const command of [
    'git push --dry-run',
    'git push -n origin fix',
    'git push origin --delete fix',
    'git push --tags',
    'git status',
    'git log --oneline | grep push',
    'pnpm run merge:pr 3 --head abc --auto',
  ])
    assert.deepEqual(pushesIn(command, '/r'), [], command);
});

test('refspecs name the commit sent and the branch updated', () => {
  assert.deepEqual(targetsOf([], 'fix'), [{ source: 'fix', branch: 'fix' }]);
  assert.deepEqual(targetsOf([], undefined), []);
  assert.deepEqual(
    targetsOf(['+abc123:refs/heads/fix', 'other', ':gone', 'HEAD'], 'cur'),
    [
      { source: 'abc123', branch: 'fix' },
      { source: 'other', branch: 'other' },
      { source: 'cur', branch: 'cur' },
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
  assert.match(decision.reason, /pnpm run merge:pr 7 --disable-auto/);
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

test('a commit and push in one command is denied when the head has a PASS', () => {
  const decision = decide({
    pr,
    verdict: pass,
    remote: carries,
    pushed: undefined,
    acknowledged: false,
    afterChange: true,
  });
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.reason, /separate command/);
  assert.match(decision.reason, /pnpm run merge:pr 7 --disable-auto/);
  const base = { pr, verdict: pass, remote: carries, afterChange: true };
  assert.equal(decide({ ...base, acknowledged: true }), undefined);
  assert.equal(decide({ ...base, remote: reverify }), undefined);
  assert.equal(decide({ ...base, verdict: undefined }), undefined);
});

test('the deny names only code files this push adds to the PR', () => {
  assert.deepEqual(
    newCodeFiles(
      { changed: ['old.ts'] },
      { changed: ['old.ts', 'new.ts', 'a.md', 'a.test.ts'] },
    ),
    ['new.ts'],
  );
  assert.deepEqual(
    newCodeFiles({ changed: ['old.ts'] }, { changed: ['old.ts', 'a.md'] }),
    ['old.ts'],
  );
  assert.deepEqual(newCodeFiles({ changed: [] }, { changed: ['a.md'] }), [
    'a.md',
  ]);
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

test('evaluate denies a commit and push to a PR whose head has a PASS', () => {
  const io = fakeIo({
    prs: [
      {
        number: 9,
        headRefOid: 'old',
        baseRefName: 'main',
        comments: [passComment],
      },
    ],
    checks: { old: { status: 0, stdout: 'carries\n' } },
  });
  const decision = evaluate('git commit -m x && git push', '/r', io);
  assert.match(decision.reason, /PR #9 .*separate command/);
  assert.ok(!io.calls.some((call) => call[1] === 'rev-parse'));
});

test('evaluate looks up the branch a switch moves to, and skips one with no commit yet', () => {
  const io = fakeIo({ prs: [], checks: {} });
  assert.equal(
    evaluate('git checkout -b new && git push -u origin HEAD', '/r', io),
    undefined,
  );
  const lookups = io.calls.filter((call) => call[1] === 'pr');
  assert.deepEqual(
    lookups.map((call) => call[call.indexOf('--head') + 1]),
    ['new'],
  );
  assert.ok(!io.calls.some((call) => call[1] === 'symbolic-ref'));
  const missing = fakeIo({
    prs: [
      {
        number: 9,
        headRefOid: 'old',
        baseRefName: 'main',
        comments: [passComment],
      },
    ],
    checks: {},
  });
  missing.git = (args) => {
    missing.calls.push(['git', ...args]);
    if (args[0] === 'rev-parse') throw new Error('unknown revision');
    return '';
  };
  assert.equal(evaluate('git push origin gone', '/r', missing), undefined);
  assert.ok(!missing.calls.some((call) => call[0] === 'check'));
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
