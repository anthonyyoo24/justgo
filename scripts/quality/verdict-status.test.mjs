import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  newestVerdict,
  runVerdictPatch,
  verdictStatus,
} from './verdict-status.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const workflows = new URL('../../.github/workflows/', import.meta.url);
const comment = (pr, id, body, author_association = 'OWNER') => ({
  author_association,
  body,
  html_url: `https://github.com/anthonyyoo24/justgo/pull/${pr}#issuecomment-${id}`,
});
const realCheck = (...refs) => runVerdictPatch(refs, root);
const fakeCheck = (status, stdout) => () => ({ status, stdout, stderr: '' });
const pr = { base: 'aaaaaaa', head: 'bbbbbbb', runId: '42' };

// First lines of real verdict comments, as posted.
const recorded = {
  pr129Free: comment(
    129,
    6666286346,
    '**Verifier verdict: PASS+NOTES** at `b77a199`, then **PASS+NOTES** at `4e079a9`. Both came from independent Claude Opus agents.\n\n- **Fixed at `f05f89b`, not re-verified by a separate agent:**',
  ),
  pr141Free: comment(
    141,
    6675405438,
    '**Verifier verdicts: PASS+NOTES** at `ab1df39`/`8a14555`, then **PASS+NOTES** at `161255b`, from two independent Claude Opus agents. The final commit `1b1eca3` only moves one `.env.example` comment, as the second verdict suggested.',
  ),
  pr141Fresh: comment(
    141,
    6685058474,
    '**Verifier verdict: PASS** on base `959e944`, head `1b1eca3`. It came from a fresh, independent Claude Opus agent. The earlier verdicts covered `161255b`, and `verdict-patch check` reported `re-verify` for `apps/api/.env.example`.\n\n- **Caution.** The rate-limit caution now sits above both budgets.',
  ),
  pr145Free: comment(
    145,
    6677574520,
    '**Verifier verdict: FAIL** at `1f415de`, then **PASS+NOTES** at `97a2043`. Both came from independent Claude Opus agents.',
  ),
};

function hasCommits(...shas) {
  return shas.every(
    (sha) =>
      spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd: root })
        .status === 0,
  );
}

test('the canonical verdict line is parsed and free-form verdicts are unreadable', () => {
  assert.deepEqual(newestVerdict([recorded.pr141Fresh]), {
    verdict: 'PASS',
    base: '959e944',
    head: '1b1eca3',
    url: recorded.pr141Fresh.html_url,
  });
  for (const free of [
    recorded.pr129Free,
    recorded.pr141Free,
    recorded.pr145Free,
  ])
    assert.deepEqual(
      newestVerdict([free]),
      { unreadable: true, url: free.html_url },
      free.html_url,
    );
  for (const line of [
    'Verifier verdict: PASS+NOTES on base `abc1234`, head `def5678`.',
    'Verifier verdict: **FAIL** on base `abc1234`, head `def5678`',
    '  **Verifier verdict: PASS+NOTES** on base `abc1234`, head `def5678`',
  ])
    assert.equal(
      newestVerdict([comment(1, 1, `Intro.\n${line}\nMore.`)])?.head,
      'def5678',
      line,
    );
  assert.equal(
    newestVerdict([
      comment(
        1,
        1,
        '> Verifier verdict: PASS on base `abc1234`, head `def5678`',
      ),
    ])?.unreadable,
    true,
  );
  assert.equal(newestVerdict([comment(1, 1, 'Thanks!')]), undefined);
});

test('a missing, heading-style or prose verdict fails with the exact format', () => {
  const unused = () => assert.fail('verdict-patch should not run');
  const missing = verdictStatus([comment(1, 1, 'Thanks!')], pr, unused);
  assert.equal(missing.ok, false);
  assert.match(
    missing.message,
    /waiting for an independent verdict on head bbbbbbb/i,
  );
  for (const body of [
    '## Verdict: PASS+NOTES\n\nAll good at `bbbbbbb`.',
    'Final verdict: PASS at `bbbbbbb`.',
    '## verifier VERDICT\nPASS',
    '**Verifier verdict:** PASS on `bbbbbbb`',
  ]) {
    const ok = comment(
      1,
      1,
      'Verifier verdict: PASS on base `aaaaaaa`, head `bbbbbbb`',
    );
    const result = verdictStatus([ok, comment(1, 2, body)], pr, unused);
    assert.equal(result.ok, false, body);
    assert.match(result.message, /unreadable/, body);
    assert.match(
      result.message,
      /Verifier verdict: PASS\|PASS\+NOTES\|FAIL on base `<base-sha>`, head `<head-sha>`/,
      body,
    );
  }
});

test('the newest owner verdict wins and other authors are ignored', () => {
  const line = (verdict, head) =>
    `**Verifier verdict: ${verdict}** on base \`aaaaaaa\`, head \`${head}\``;
  const comments = [
    comment(1, 1, line('FAIL', '1111111')),
    comment(1, 2, line('PASS', '2222222')),
    comment(1, 3, 'Thanks!'),
    comment(1, 4, line('PASS', '3333333'), 'CONTRIBUTOR'),
    comment(1, 5, line('PASS', '4444444'), 'NONE'),
  ];
  assert.equal(newestVerdict(comments)?.head, '2222222');
});

test('no verdict fails, FAIL fails, and verdict-patch decides the rest', () => {
  const verdict = (word) => [
    comment(
      1,
      1,
      `Verifier verdict: ${word} on base \`aaaaaaa\`, head \`ccccccc\``,
    ),
  ];
  const unused = () => assert.fail('verdict-patch should not run');
  assert.equal(verdictStatus([], pr, unused).ok, false);
  const failed = verdictStatus(verdict('FAIL'), pr, unused);
  assert.equal(failed.ok, false);
  assert.match(failed.message, /gh run rerun 42 --failed/);
  assert.equal(
    verdictStatus(verdict('PASS'), pr, fakeCheck(0, 'carries\n')).ok,
    true,
  );
  assert.equal(
    verdictStatus(
      verdict('PASS+NOTES'),
      pr,
      fakeCheck(0, 'docs-tests-only\n  README.md\n'),
    ).ok,
    true,
  );
  const stale = verdictStatus(
    verdict('PASS'),
    pr,
    fakeCheck(1, 're-verify\n  app.ts\n'),
  );
  assert.equal(stale.ok, false);
  assert.match(stale.message, /app\.ts/);
  assert.match(stale.message, /fresh independent verdict on head bbbbbbb/);
  assert.match(stale.message, /gh run rerun 42 --failed/);
  assert.equal(
    verdictStatus(verdict('PASS'), pr, fakeCheck(1, 'Error: boom\n')).ok,
    false,
  );
  assert.equal(
    verdictStatus(verdict('PASS'), pr, () => ({
      status: 2,
      stdout: '',
      stderr: 'Unknown commit: ccccccc.',
    })).ok,
    false,
  );
});

// The #129 and #141 verdicts predate the canonical line, so their stale
// verdicts are restated in it with the same base and head.
test(
  'replay #129: the fence fix pushed after the 4e079a9 verdict fails until a fresh verdict',
  {
    skip:
      !hasCommits('50194ee', '4e079a9', 'f05f89b') &&
      'PR #129 commits are not in this clone',
  },
  () => {
    const head = { base: '50194ee', head: 'f05f89b' };
    const stale = [
      comment(
        129,
        6666286346,
        '**Verifier verdict: PASS+NOTES** on base `50194ee`, head `4e079a9`.',
      ),
    ];
    const failed = verdictStatus(stale, head, realCheck);
    assert.equal(failed.ok, false);
    assert.match(failed.message, /re-verify/);
    assert.match(failed.message, /scripts\/quality\/pr-description\.mjs/);
    const fresh = comment(
      129,
      6669967755,
      '**Verifier verdict: PASS+NOTES** on base `50194ee`, head `f05f89b`.',
    );
    assert.equal(verdictStatus([...stale, fresh], head, realCheck).ok, true);
  },
);

test(
  'replay #141: the .env.example move after the 161255b verdict fails until the fresh verdict',
  {
    skip:
      !hasCommits('959e944', '161255b', '1b1eca3') &&
      'PR #141 commits are not in this clone',
  },
  () => {
    const head = { base: '959e944', head: '1b1eca3' };
    const stale = [
      recorded.pr141Free,
      comment(
        141,
        6675405438,
        '**Verifier verdict: PASS+NOTES** on base `959e944`, head `161255b`.',
      ),
    ];
    const failed = verdictStatus(stale, head, realCheck);
    assert.equal(failed.ok, false);
    assert.match(failed.message, /apps\/api\/\.env\.example/);
    const passed = verdictStatus(
      [...stale, recorded.pr141Fresh],
      head,
      realCheck,
    );
    assert.equal(passed.ok, true);
    assert.match(passed.message, /carries/);
  },
);

test('the sections job checks the verdict and a verdict comment reruns it', () => {
  const sections = readFileSync(
    new URL('pr-description.yml', workflows),
    'utf8',
  );
  assert.match(sections, /^ {2}pull-requests: read$/m);
  assert.match(sections, /scripts\/quality\/verdict-status\.mjs$/m);
  assert.match(sections, /run: node scripts\/quality\/verdict-status\.mjs/);
  assert.doesNotMatch(sections, /pull_request_target|issue_comment/);
  const recheck = readFileSync(
    new URL('verdict-recheck.yml', workflows),
    'utf8',
  );
  assert.match(recheck, /^ {2}issue_comment:$/m);
  assert.match(recheck, /author_association == 'OWNER'/);
  assert.match(
    recheck,
    /^permissions:\n {2}actions: write\n {2}pull-requests: read$/m,
  );
  assert.doesNotMatch(recheck, /checkout|pull_request_target/);
  assert.match(recheck, /gh run rerun/);
});

test('the sections sparse checkout includes every local import of its scripts', () => {
  const sections = readFileSync(
    new URL('pr-description.yml', workflows),
    'utf8',
  );
  const listed = new Set(
    sections
      .match(/^ {12}scripts\/quality\/[\w.-]+\.mjs$/gm)
      .map((line) => line.trim()),
  );
  for (const script of listed) {
    const source = readFileSync(
      new URL(`../../${script}`, import.meta.url),
      'utf8',
    );
    for (const [, local] of source.matchAll(/from '\.\/([\w.-]+\.mjs)'/g))
      assert.ok(
        listed.has(`scripts/quality/${local}`),
        `${script} imports ${local}, which the sections sparse checkout leaves out`,
      );
  }
});
