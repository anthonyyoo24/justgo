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
    // #312: quotes and backslashes only group words, so these run the same
    // subcommand, and gh reads a flag before the subcommand.
    'gh pr "merge" 207',
    "gh pr 'merge' 207 --squash",
    'gh "pr" merge 207',
    'gh pr m"erge" 207',
    'gh pr ""merge 207',
    'gh pr \\merge 207',
    "gh pr $'merge' 207",
    'gh pr $"merge" 207',
    'gh pr mer\\\nge 207',
    'gh pr mer\\\r\nge 207',
    'gh pulls/"207"/merge',
    'gh pr -R a/b merge 207',
    'gh pr -Ra/b merge 207',
    'gh pr --repo a/b merge 207',
    'gh pr --repo=a/b "merge" 207',
    // #312: the GraphQL mutations merge or arm a PR without the REST path.
    `gh api graphql -f query='mutation { mergePullRequest(input: {pullRequestId: "X"}) { clientMutationId } }'`,
    `gh api graphql -f query='mutation { enablePullRequestAutoMerge(input: {pullRequestId: "X", mergeMethod: SQUASH}) { clientMutationId } }'`,
    "gh api graphql -F query=@- <<< 'mutation { mergePullRequest(input: {}) { clientMutationId } }'",
    `curl -X POST https://api.github.com/graphql -d '{"query":"mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }"}'`,
    // Harmless mentions are denied too; the message says how to avoid them.
    "grep -n 'gh pr merge' AGENTS.md",
    'git commit -m "docs: say gh pr merge goes through merge:pr"',
  ]) {
    const decision = decide(command);
    assert.equal(decision?.permissionDecision, 'deny', command);
    assert.match(decision.reason, /pnpm run merge:pr <n> --head <sha>/);
    assert.match(decision.reason, /pnpm run merge:pr <n> --disable-auto/);
    assert.doesNotMatch(decision.reason, /`--\s/);
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
    'gh pr view 3 --json mergeable,mergeStateStatus',
    'gh pr list --search "is:merged" --json number',
    'gh pr -R a/b view 3',
    `gh api graphql -f query='query { repository(owner: "o", name: "r") { pullRequest(number: 3) { mergeable autoMergeRequest { enabledAt } } } }'`,
  ])
    assert.equal(decide(command), undefined, command);
});

// #348
test('parameter expansion, repeated flags and the merge queue are denied', () => {
  for (const command of [
    'gh pr ${x:-merge} 1',
    'gh pr m${x}erge 1',
    'gh pr -R a/b -R a/b merge 1',
    'gh pr m${}erge 1',
    'gh pr ${x-merge} 1',
    'gh pr ${x:=merge} 1',
    'gh pr ${x:+merge} 1',
    'gh pr "${x:-merge}" 1',
    'gh pr ${x:-"merge"} 1',
    'gh pr ${#x}merge 1',
    'gh pr --repo=a/b -R c/d --repo e/f merge 1',
    `gh pr ${'-R a/b '.repeat(16)}merge 1`,
    `gh api graphql -f query='mutation { enqueuePullRequest(input: {pullRequestId: "X"}) { clientMutationId } }'`,
  ]) {
    const decision = decide(command);
    assert.equal(decision?.permissionDecision, 'deny', command);
    assert.match(decision.reason, /expansions/);
    assert.match(decision.reason, /enqueuePullRequest/);
  }
  for (const command of [
    'gh pr view ${n} --json state',
    'echo ${HOME} && gh pr list',
    'gh pr -R a/b -R a/b view 1',
    // Branch merges, not PR merges: branch protection guards `main`.
    'gh api -X POST repos/o/r/merges -f base=feature -f head=main',
    `gh api graphql -f query='mutation { mergeBranch(input: {repositoryId: "X", base: "feature", head: "main"}) { clientMutationId } }'`,
  ])
    assert.equal(decide(command), undefined, command);
});

test('120k-character lines take well under a second, far below the 10 s timeout', () => {
  const size = 120_000;
  const fill = (unit) => unit.repeat(Math.ceil(size / unit.length));
  for (const text of [
    fill('gh pr '),
    fill('gh pr -R a/b '),
    fill('-R pr '),
    `gh ${fill('-R pr ')}`,
    `gh pr ${fill('-R=a ')}`,
    fill('${'),
    fill('${x:-'),
    `gh pr ${fill('${x}')}`,
    fill('gh "pr" ${x} '),
  ]) {
    const started = performance.now();
    decide(text);
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 1000, `${text.slice(0, 20)}… took ${elapsed} ms`);
  }
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
