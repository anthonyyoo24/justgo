import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// PreToolUse hook on Bash. Agents merge only through
// scripts/quality/merge-pr.mjs (`pnpm run merge:pr`), which checks the merge
// order with git merge-tree before it calls gh. This hook keeps that the only
// door. It denies any Bash command whose text runs or mentions `gh … pr merge`
// on one line (after joining backslash-newlines) or a `pulls/<n>/merge` API
// path. It reads text and does not parse shell, so a harmless mention such as
// a grep is denied too, and the message says how to get around that. The
// script's own gh call is a child process, not a Bash tool call, so the hook
// never sees it.
// settings.json sets onFailure "block", so a hook that cannot start, crashes
// or times out also stops the call.

const ghPrMerge = /\bgh\b[^\n]*?\bpr\s+merge\b/;
const apiMerge = /\bpulls\/[^\s/]+\/merge\b/;

const reason =
  'merge-order-guard: merge only through `pnpm run merge:pr <n> --head <sha> [--auto]` ' +
  '(or `pnpm run merge:pr <n> --disable-auto` to disarm), which checks the merge order first. ' +
  'This hook denies any Bash command whose text contains `gh pr merge` or a ' +
  '`pulls/<n>/merge` API path, including harmless mentions such as a grep or ' +
  'a commit message. For a search, leave out `gh` (for example ' +
  "`grep -n 'pr merge'`). For text, write it to a file with the Write tool " +
  'and pass the file.';

export function decide(command) {
  const text = command.replace(/\\\r?\n/g, ' ');
  if (ghPrMerge.test(text) || apiMerge.test(text))
    return { permissionDecision: 'deny', reason };
  return undefined;
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
