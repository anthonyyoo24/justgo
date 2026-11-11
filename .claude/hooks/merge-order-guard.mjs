import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// PreToolUse hook on Bash. Agents merge only through
// scripts/quality/merge-pr.mjs (`pnpm run merge:pr`), which checks the merge
// order with git merge-tree before it calls gh. This hook keeps that the only
// door. It denies any Bash command whose text runs or mentions `gh … pr merge`
// on one line (after joining backslash-newlines, with one `-R`/`--repo` flag
// allowed between `pr` and `merge`), a `pulls/<n>/merge` API path, or the
// GraphQL `mergePullRequest` or `enablePullRequestAutoMerge` mutation. Shell
// quotes and backslashes only group words, so it also checks the text with
// them removed, which catches `gh pr "merge"`, `gh pr $'merge'` and a
// backslash-newline inside the word. It reads text and does not
// parse shell, so a harmless mention such as a grep is denied too, and the
// message says how to get around that. A command that builds the words at
// runtime, or reads a GraphQL query from a file, is caught only in review.
// The script's own gh call is a child process, not a Bash tool call, so the
// hook never sees it.
// settings.json sets onFailure "block", so a hook that cannot start, crashes
// or times out also stops the call.

const ghPrMerge =
  /\bgh\b[^\n]*?\bpr\s+(?:(?:-R|--repo)(?:=|\s+)?\S+\s+)?merge\b/;
const apiMerge = /\bpulls\/[^\s/]+\/merge\b/;
const graphqlMerge = /\b(?:mergePullRequest|enablePullRequestAutoMerge)\b/;

const reason =
  'merge-order-guard: merge only through `pnpm run merge:pr <n> --head <sha> [--auto]` ' +
  '(or `pnpm run merge:pr <n> --disable-auto` to disarm), which checks the merge order first. ' +
  'This hook denies any Bash command whose text contains `gh pr merge` (quoted ' +
  'words included), a `pulls/<n>/merge` API path or a GraphQL ' +
  '`mergePullRequest` or `enablePullRequestAutoMerge` mutation, including ' +
  'harmless mentions such as a grep or a commit message. For a search, leave ' +
  "out `gh` (for example `grep -n 'pr merge'`). For text, write it to a file " +
  'with the Write tool and pass the file.';

export function decide(command) {
  const joined = command.replace(/\\\r?\n/g, ' ');
  // The shell drops a backslash-newline inside a word (`mer\<newline>ge`) and
  // the `$` of `$'…'` and `$"…"`, so the unquoted copy does too.
  const unquoted = command
    .replace(/\\\r?\n/g, '')
    .replace(/\$(?=["'])/g, '')
    .replace(/["'\\]/g, '');
  const denied = [joined, unquoted].some(
    (text) =>
      ghPrMerge.test(text) || apiMerge.test(text) || graphqlMerge.test(text),
  );
  return denied ? { permissionDecision: 'deny', reason } : undefined;
}

export function output(decision) {
  if (!decision) return undefined;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision.permissionDecision,
      permissionDecisionReason: decision.reason,
    },
  };
}

function main() {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  if (event.tool_name !== 'Bash') return;
  const result = output(decide(String(event.tool_input?.command ?? '')));
  if (result) process.stdout.write(JSON.stringify(result));
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  main();
