import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  evaluate,
  output,
  prsOf,
} from '../../.claude/hooks/review-rounds-guard.mjs';

const hook = fileURLToPath(
  new URL('../../.claude/hooks/review-rounds-guard.mjs', import.meta.url),
);
const HEAD = 'b'.repeat(40);
const verdict = (word, head = HEAD.slice(0, 7), extra = '') => ({
  authorAssociation: 'OWNER',
  body: `Verifier verdict: ${word} on base \`aaaaaaa\`, head \`${head}\`\nSensitive: no${extra}`,
  url: 'https://github.com/o/r/pull/1#issuecomment-1',
});
const shown = '\nFailure shown: `npm test` fails';

// A fake GitHub and git. `prs` maps a PR number to what `gh pr view` returns.
function fakeIo(prs, { check = 'carries', fail = false } = {}) {
  const calls = { check: 0 };
  return {
    calls,
    gh(args) {
      if (fail) throw new Error('gh: network down');
      if (args[0] === 'pr' && args[1] === 'view') {
        const pr = prs[args[2]];
        if (!pr) throw new Error('no such PR');
        return JSON.stringify({
          state: 'OPEN',
          headRefOid: HEAD,
          baseRefName: 'main',
          ...pr,
        });
      }
      if (args[0] === 'api')
        return `${args[1].split('/').at(-1).padEnd(40, '0')}\n`;
      throw new Error(`unexpected gh ${args.join(' ')}`);
    },
    git() {
      return '';
    },
    check() {
      calls.check += 1;
      return {
        status: check === 're-verify' ? 1 : 0,
        stdout: `${check}\n`,
        stderr: '',
      };
    },
  };
}
const verifier = (prompt, description = 'Verify PR #7') => ({
  description,
  prompt,
});

test('the PRs under review come from the description, else the prompt', () => {
  // A description that names a PR scopes the check to it, so a stacked
  // parent or a PR the prompt only mentions is never checked.
  assert.deepEqual(
    prsOf({
      description: 'Verify PR #7',
      prompt: 'Also https://github.com/o/r/pull/12 and pr#7.',
    }),
    ['7'],
  );
  assert.deepEqual(
    prsOf({
      description: 'Verify the batch',
      prompt:
        'Also https://github.com/o/r/pull/12 and pr#7. Issue #9 is not a PR.',
    }),
    ['12', '7'],
  );
});

test('a PR the brief only mentions is not checked', () => {
  const io = fakeIo({
    309: { comments: [verdict('PASS')] },
    310: { comments: [] },
  });
  assert.equal(
    evaluate(
      verifier(
        'PR #310 stacks on PR #309, which already passed.',
        'Verify PR #310',
      ),
      '/r',
      io,
    ),
    undefined,
  );
});

// #361
test.todo('a link to another repository is not a JustGO PR', () => {
  const io = fakeIo({ 9: { comments: [verdict('PASS')] } });
  assert.equal(
    evaluate(
      verifier(
        'Port https://github.com/cursor/plugins/pull/9 here.',
        'Verify the port',
      ),
      '/r',
      io,
    ),
    undefined,
  );
});

test('a verifier on a PR whose PASS still covers its head is denied', () => {
  for (const word of ['PASS', 'PASS+NOTES']) {
    const io = fakeIo({ 7: { comments: [verdict(word)] } });
    const decision = evaluate(verifier('Post a verdict.'), '/r', io);
    assert.equal(decision?.permissionDecision, 'deny', word);
    assert.match(decision.reason, /PR #7 already has a passing verdict/);
    assert.match(decision.reason, /issue or a follow-up PR/);
    assert.equal(io.calls.check, 0, 'an exact head match needs no git');
  }
});

test('a PASS on an older head blocks only when verdict-patch keeps it', () => {
  const old = { 7: { comments: [verdict('PASS', 'ccccccc')] } };
  for (const kept of ['carries', 'docs-tests-only'])
    assert.equal(
      evaluate(verifier(''), '/r', fakeIo(old, { check: kept }))
        ?.permissionDecision,
      'deny',
      kept,
    );
  assert.equal(
    evaluate(verifier(''), '/r', fakeIo(old, { check: 're-verify' })),
    undefined,
  );
});

test('the fourth verifier after three FAIL verdicts is denied, the third is not', () => {
  const two = [
    verdict('FAIL', 'ccccccc', shown),
    verdict('FAIL', 'ddddddd', shown),
  ];
  assert.equal(
    evaluate(verifier(''), '/r', fakeIo({ 7: { comments: two } })),
    undefined,
  );
  const three = [...two, verdict('FAIL', 'eeeeeee')];
  const decision = evaluate(
    verifier(''),
    '/r',
    fakeIo({ 7: { comments: three } }),
  );
  assert.equal(decision?.permissionDecision, 'deny');
  assert.match(
    decision.reason,
    /PR #7 has 3 FAIL verdicts, and the limit is 3/,
  );
  assert.match(decision.reason, /bring it to Anthony/);
  // Only owner comments count, as in the verdict check.
  const others = three.map((c) => ({ ...c, authorAssociation: 'NONE' }));
  assert.equal(
    evaluate(verifier(''), '/r', fakeIo({ 7: { comments: others } })),
    undefined,
  );
});

test('only verifiers of open PRs are checked', () => {
  const passed = { 7: { comments: [verdict('PASS')] } };
  assert.equal(
    evaluate(
      { description: 'Research the PR #7 history', prompt: '' },
      '/r',
      fakeIo(passed),
    ),
    undefined,
  );
  assert.equal(
    evaluate(
      verifier(''),
      '/r',
      fakeIo({ 7: { state: 'MERGED', comments: [verdict('PASS')] } }),
    ),
    undefined,
  );
  // A batch verifier is denied when any PR it names is done.
  const batch = evaluate(
    verifier('PR #7 and PR #8', 'Verify the batch'),
    '/r',
    fakeIo({ 7: { comments: [] }, 8: { comments: [verdict('PASS')] } }),
  );
  assert.match(batch?.reason ?? '', /PR #8 already has a passing verdict/);
});

test('Anthony can ask for another round, and errors let the call through', () => {
  const passed = { 7: { comments: [verdict('PASS')] } };
  assert.equal(
    evaluate(
      verifier('Another round: Anthony said "re-check #7 please"'),
      '/r',
      fakeIo(passed),
    ),
    undefined,
  );
  assert.equal(
    evaluate(verifier('Another round:'), '/r', fakeIo(passed))
      ?.permissionDecision,
    'deny',
  );
  assert.equal(
    evaluate(verifier(''), '/r', fakeIo(passed, { fail: true })),
    undefined,
  );
});

test('the hook denies through PreToolUse output and is registered on Agent', () => {
  assert.deepEqual(output({ permissionDecision: 'deny', reason: 'x' }), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'x',
    },
  });
  const quiet = spawnSync(process.execPath, [hook], {
    input: JSON.stringify({
      tool_name: 'Agent',
      tool_input: { description: 'Research', prompt: 'x' },
    }),
    encoding: 'utf8',
  });
  assert.equal(quiet.status, 0);
  assert.equal(quiet.stdout, '');
  const settings = JSON.parse(
    readFileSync(new URL('../../.claude/settings.json', import.meta.url)),
  );
  const agent = settings.hooks.PreToolUse.find((h) => h.matcher === 'Agent');
  const entry = agent.hooks.find((h) =>
    h.command.includes('review-rounds-guard.mjs'),
  );
  assert.ok(entry, 'review-rounds-guard runs before every Agent call');
  // A guard that saves review rounds fails open, so no onFailure block.
  assert.equal(entry.onFailure, undefined);
});
