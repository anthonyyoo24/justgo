import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// PreToolUse hook on Bash. Agents merge only through
// scripts/quality/merge-pr.mjs (`pnpm run merge:pr`), which checks the merge
// order with git merge-tree before it calls gh. This hook keeps that the only
// door. It denies any Bash command whose text runs or mentions `gh … pr merge`
// on one line (after joining backslash-newlines, with up to 16 `-R`/`--repo`
// flags allowed between `pr` and `merge`), a `pulls/<n>/merge` API path, or
// the GraphQL `mergePullRequest`, `enablePullRequestAutoMerge` or
// `enqueuePullRequest` mutation. Shell quotes and backslashes only group
// words, so it also checks the text with them removed, which catches
// `gh pr "merge"`, `gh pr $'merge'` and a backslash-newline inside the word.
// Three more unquoted copies drop each `$name` variable. The second of them
// also replaces each `${…}` expansion with its default or alternate word, or
// with nothing, and the third drops each `${…}` whole. They catch
// `gh pr m$x"erge"`, `gh pr ${x:-merge}`, `gh pr m${x}erge` and
// `gh pr m${x:+zz}erge`, while the first two unquoted copies keep any command
// inside an expansion, such as `${HOME#$(gh pr "merge" 1)}`. A mention split
// across lines, such as `gh pr` and `merge` on separate lines, merges nothing
// and passes. GraphQL `mergeBranch`
// and the REST `merges` endpoint merge branches, not PRs. Branch protection blocks them on `main`, and on a
// PR branch they do what `update-branch` does, so they pass. It reads text
// and does not parse shell, so a harmless mention such as a grep is denied
// too, and the message says how to get around that. A command that builds
// the words at runtime in other ways (a nested `${…}`, a variable set
// earlier), or reads a GraphQL query from a file, is caught only in review.
// The script's own gh call is a child process, not a Bash tool call, so the
// hook never sees it.
// settings.json sets onFailure "block", so a hook that cannot start, crashes
// or times out also stops the call.

// `pr merge` after the first `gh` of a line. Searching from that one `gh`,
// instead of trying a lazy `gh.*?pr` from every `gh`, keeps a long line of
// repeated `gh pr` linear. A flag is `-R=…` or `--repo=…` with any value,
// even an empty one, which gh reads as no override, or the flag, spaces and
// a value, or `-Rvalue`. The three forms start with `=`, a space or another
// character, so each flag has one parse, and the count is capped, so a long
// line of flags cannot backtrack badly either.
const ghWord = /\bgh\b/;
const prMerge =
  /\bpr\s+(?:(?:-R|--repo)(?:=\S*|\s+\S+|[^\s=]\S*)\s+){0,16}merge\b/;
const ghPrMerge = (text) =>
  text.split('\n').some((line) => {
    const gh = ghWord.exec(line);
    // The character after `gh` is not a word character, so `\bpr` in the
    // rest of the line sees the same boundary it would in the whole line.
    return gh !== null && prMerge.test(line.slice(gh.index + 2));
  });
const apiMerge = /\bpulls\/[^\s/]+\/merge\b/;
const graphqlMerge =
  /\b(?:mergePullRequest|enablePullRequestAutoMerge|enqueuePullRequest)\b/;
// A `${…}` with no brace inside its body. Bodies never overlap, so one pass
// is linear in the text length.
const expansion = /\$\{([^{}]*)\}/g;
// `${x:-w}`, `${x-w}`, `${x:=w}`, `${x:+w}` and the like keep `w`. `${x}`,
// `${#x}` and zsh's `${}` keep nothing. `${x:+zz}`, `${x:0:1}` and zsh's
// `${x[-1]}` can expand to nothing, which dropping the whole `${…}` covers.
const expanded = (body) => body.replace(/^[^:=+?-]*:?[-=+?]?/, '');
// `$name`, `$1` and the special parameters `$@`, `$*`, `$#`, `$?`, `$$`,
// `$!` and `$-`. Not `${`, `$(` or `$'`.
const variable = /\$(?:[A-Za-z_]\w*|[@*#?$!0-9-])/g;

const reason =
  'merge-order-guard: merge only through `pnpm run merge:pr <n> --head <sha> [--auto]` ' +
  '(or `pnpm run merge:pr <n> --disable-auto` to disarm), which checks the merge order first. ' +
  'This hook denies any Bash command whose text contains `gh pr merge` (quoted ' +
  'words and `${…}` expansions included), a `pulls/<n>/merge` API path or a ' +
  'GraphQL `mergePullRequest`, `enablePullRequestAutoMerge` or ' +
  '`enqueuePullRequest` mutation, including ' +
  'harmless mentions such as a grep or a commit message. For a search, leave ' +
  "out `gh` (for example `grep -n 'pr merge'`). For text, write it to a file " +
  'with the Write tool and pass the file.';

export function decide(command) {
  const joined = command.replace(/\\\r?\n/g, ' ');
  // The shell drops a backslash-newline inside a word (`mer\<newline>ge`) and
  // the `$` of `$'…'` and `$"…"`, so the unquoted copies do too.
  const spliced = command.replace(/\\\r?\n/g, '').replace(/\$(?=["'])/g, '');
  const unquote = (text) => text.replace(/["'\\]/g, '');
  // An unset variable expands to nothing, so `m$x"erge"` and `m$@erge` run
  // `merge`. Variables go before the quotes, which end their names.
  const bare = spliced.replace(variable, '');
  // Each copy only adds matches: the last two drop the text inside an
  // expansion, so the others keep it, as in `${HOME#$(gh pr "merge" 1)}`.
  const denied = [
    joined,
    unquote(spliced),
    unquote(bare),
    unquote(bare.replace(expansion, (_, body) => expanded(body))),
    unquote(bare.replace(expansion, '')),
  ].some(
    (text) => ghPrMerge(text) || apiMerge.test(text) || graphqlMerge.test(text),
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
