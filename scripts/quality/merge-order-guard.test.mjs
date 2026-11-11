import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { decide, output } from '../../.claude/hooks/merge-order-guard.mjs';

const hook = fileURLToPath(
  new URL('../../.claude/hooks/merge-order-guard.mjs', import.meta.url),
);

test('raw merges are denied in every shape and point at the script', () => {
  for (const command of [
    'gh pr merge 214 --squash',
    'gh pr merge 236 --auto --squash --match-head-commit abc',
    'gh pr merge 3 --disable-auto',
    'gh -R a/b pr merge 207',
    '/opt/homebrew/bin/gh pr merge 207',
    'for n in 1 2; do gh pr merge $n; done',
    'echo 210 | xargs gh pr merge --squash',
    "bash -c 'gh pr merge 207'",
    'x="$(gh pr merge 207)"',
    'gh pr \\\nmerge 207',
    'cat <<EOF | bash\ngh pr merge 207\nEOF',
    'gh api -X PUT repos/o/r/pulls/207/merge',
    'curl -X PUT https://api.github.com/repos/o/r/pulls/207/merge',
    // Harmless mentions are denied too; the message says how to avoid them.
    "grep -n 'gh pr merge' AGENTS.md",
    'git commit -m "docs: say gh pr merge goes through merge:pr"',
  ]) {
    const decision = decide(command);
    assert.equal(decision?.permissionDecision, 'deny', command);
    assert.match(decision.reason, /pnpm run merge:pr <n> --head <sha>/);
    assert.match(decision.reason, /harmless mentions/);
  }
});

test('the merge script and other commands pass', () => {
  for (const command of [
    `pnpm run merge:pr 236 --head ${'a'.repeat(40)} --auto --squash`,
    'pnpm run merge:pr 236 --disable-auto',
    'node scripts/quality/merge-pr.mjs 5 --head abc',
    'node scripts/quality/merge-order.mjs',
    "grep -n 'pr merge' AGENTS.md",
    'gh pr view 3 && git merge main',
    'gh pr list --json number',
    'git merge-tree --write-tree origin/main HEAD',
    'gh pr view 3\ngit log --grep="pr merge"',
  ])
    assert.equal(decide(command), undefined, command);
});

test('output wraps a denial for Claude Code', () => {
  assert.deepEqual(output(decide('gh pr merge 1')), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: decide('gh pr merge 1').reason,
    },
  });
  assert.equal(output(undefined), undefined);
});

test('the hook process denies Bash merges and ignores other tools', () => {
  const run = (event) =>
    spawnSync(process.execPath, [hook], {
      input: JSON.stringify(event),
      encoding: 'utf8',
    });
  const denied = run({
    tool_name: 'Bash',
    tool_input: { command: 'gh pr merge 1 --squash' },
  });
  assert.equal(denied.status, 0);
  assert.equal(
    JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision,
    'deny',
  );
  assert.equal(
    run({ tool_name: 'Bash', tool_input: { command: 'ls' } }).stdout,
    '',
  );
  assert.equal(
    run({ tool_name: 'Agent', tool_input: { prompt: 'gh pr merge 1' } }).stdout,
    '',
  );
  const broken = spawnSync(process.execPath, [hook], {
    input: 'not json',
    encoding: 'utf8',
  });
  assert.notEqual(broken.status, 0);
});

test('settings run the guard on Bash and block when it fails', () => {
  const settings = JSON.parse(
    readFileSync(new URL('../../.claude/settings.json', import.meta.url)),
  );
  const entry = settings.hooks.PreToolUse.find(({ hooks }) =>
    hooks[0]?.command.includes('merge-order-guard.mjs'),
  );
  assert.ok(entry, 'no PreToolUse entry runs merge-order-guard.mjs');
  assert.equal(entry.matcher, 'Bash');
  assert.equal(entry.hooks[0].onFailure, 'block');
});
