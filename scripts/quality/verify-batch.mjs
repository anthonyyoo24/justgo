import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isSensitivePath } from './sensitive-paths.mjs';
import { newestVerdictOf } from './merge-order.mjs';

// Lists the open PRs that can share one verifier, in batches. A PR qualifies
// when it needs a verdict, is not a draft and is small: it touches no
// sensitive path and no boundary file below, and changes at most `maxLines`
// counted lines. Every other PR keeps its own verifier. The verifier-model
// hook runs a verifier on Sonnet when every PR it names is small. The verifier of a batch still posts a
// separate verdict comment on each PR, because the `verdict` check reads each
// PR's own comments.
//
// `--brief <n>...` prints the brief to start one verifier on those PRs. It
// carries the verifier rules from AGENTS.md (read CI, check only what the
// change touches, no fuzzers, notes stay in the verdict) so a coordinator
// does not have to remember them. Add one or two lines on what the PRs do.
//
// Usage: node scripts/quality/verify-batch.mjs [--json | --brief <n>...]

export const maxLines = 150;
export const maxBatchPulls = 4;

// Files whose change reaches past one capability: shared contracts, the
// database, CI, dependencies, and the hooks, settings, skills, lint config and
// quality scripts that enforce the agent rules.
const boundary = [
  /^packages\/contracts\//,
  /^apps\/api\/src\/db\//,
  /^apps\/api\/drizzle\//,
  /^\.github\//,
  /(^|\/)package(-lock)?\.json$/,
  /^pnpm-(lock|workspace)\.yaml$/,
  /(^|\/)\.npmrc$/,
  /^\.nvmrc$/,
  /^\.claude\/hooks\//,
  /^\.claude\/settings\.json$/,
  /^\.claude\/skills\//,
  /^eslint\.config\.mjs$/,
  /^scripts\/quality\/(?![^/]+\.test\.mjs$)[^/]+\.mjs$/,
];

// Tests and docs do not count toward the size, because a PR carries the tests
// and doc updates of its change. The agent instructions and the operations
// docs still count, because they change what agents do.
const testFile = [
  /(^|\/)[^/]+\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)(tests|__tests__)\//,
];
const countedMarkdown = [/^AGENTS\.md$/, /^docs\/operations\//];

export const isBoundaryFile = (path) =>
  boundary.some((rule) => rule.test(path));
export const isTestFile = (path) => testFile.some((rule) => rule.test(path));
export const isCountedFile = (path) =>
  !isTestFile(path) &&
  (!path.endsWith('.md') || countedMarkdown.some((rule) => rule.test(path)));

export function countedLines(files) {
  return files
    .filter((file) => isCountedFile(file.path))
    .reduce((sum, file) => sum + file.additions + file.deletions, 0);
}

// Why a PR's files are not small, or undefined when they are. Each file is
// `{ path, additions, deletions }`. An empty list is never small.
export function sizeExclusion(files) {
  if (files.length === 0) return 'no files listed';
  const sensitive = files.find((file) => isSensitivePath(file.path));
  if (sensitive) return `sensitive path ${sensitive.path}`;
  const edge = files.find((file) => isBoundaryFile(file.path));
  if (edge) return `boundary file ${edge.path}`;
  const lines = countedLines(files);
  if (lines > maxLines)
    return `${lines} counted changed lines (limit ${maxLines})`;
  return undefined;
}

// A PR needs a verdict unless the `verdict` check passed, or the newest owner
// verdict is a PASS on the current head. While the check is still running, a
// PASS on an older head may carry (after a merge from main), so the PR waits
// for the check instead of joining a batch.
export function needsVerdict(pull) {
  const check = (pull.statusCheckRollup ?? []).find(
    (entry) => entry.name === 'verdict',
  );
  if (check?.conclusion === 'SUCCESS') return false;
  const found = newestVerdictOf(pull.comments);
  if (!found || found.unreadable || found.verdict === 'FAIL') return true;
  if (pull.headRefOid.startsWith(found.head)) return false;
  return !check || check.status === 'COMPLETED';
}

// Why a PR needing a verdict cannot join a batch, or undefined when it can.
export function exclusion(pull) {
  if (pull.isDraft) return 'draft';
  return sizeExclusion(pull.files ?? []);
}

// Groups the qualifying PRs in number order, at most `maxBatchPulls` a batch.
// Each PR is already small, so a batch needs no line limit of its own.
export function plan(pulls) {
  const waiting = pulls
    .filter(needsVerdict)
    .sort((a, b) => a.number - b.number);
  const batches = [];
  const alone = [];
  for (const pull of waiting) {
    const reason = exclusion(pull);
    if (reason) {
      alone.push({ number: pull.number, title: pull.title, reason });
      continue;
    }
    const lines = countedLines(pull.files);
    const last = batches.at(-1);
    if (last && last.pulls.length < maxBatchPulls) {
      last.pulls.push({ number: pull.number, title: pull.title, lines });
      last.lines += lines;
    } else
      batches.push({
        pulls: [{ number: pull.number, title: pull.title, lines }],
        lines,
      });
  }
  return { batches, alone };
}

export function format({ batches, alone }) {
  const out = [];
  if (batches.length === 0 && alone.length === 0)
    return 'No open PR needs a verdict.';
  batches.forEach((batch, index) => {
    const label =
      batch.pulls.length > 1 ? 'one verifier for all' : 'only one fits';
    out.push(`Batch ${index + 1} (${batch.lines} lines, ${label}):`);
    for (const pull of batch.pulls)
      out.push(`  #${pull.number} ${pull.title} (${pull.lines} lines)`);
  });
  if (alone.length) {
    out.push('Own verifier:');
    for (const pull of alone)
      out.push(`  #${pull.number} ${pull.title}: ${pull.reason}`);
  }
  out.push(
    'Start each verifier with: node scripts/quality/verify-batch.mjs --brief <n>...',
  );
  return out.join('\n');
}

const repo = 'https://github.com/anthonyyoo24/justgo';

export function brief(numbers) {
  const many = numbers.length > 1;
  const names = numbers.map((n) => `#${n}`).join(', ');
  const links = numbers.map((n) => `PR #${n} (${repo}/pull/${n})`).join(', ');
  return [
    `Agent description: Verify PR${many ? 's' : ''} ${names}`,
    '',
    `You are the independent verifier for JustGO ${links}. You did not write ${many ? 'them' : 'it'}.`,
    '',
    'Rules (AGENTS.md, "Git and autonomy"):',
    '- Read the full suites from CI with `gh pr checks <n>`, and wait with `--watch` while they run. Do not rerun install, typechecks, lint, architecture, workspace tests, `test:db`, journeys or exports locally.',
    '- Check only what the change touches: read `gh pr diff <n>`, run the focused tests for the changed behavior, and drive a user-facing change with `verify-justgo`.',
    '- Write no fuzzer or broad sweep unless a concrete failure needs one. A probe that runs generated shell text uses stub commands, never real programs such as `say` or `open`.',
    '- Only a check that broke on the head is a FAIL. Anything else is a note.',
    '- Notes stay in the verdict comment. File no issues, and push or merge nothing.',
    '',
    `Post one verdict comment on ${many ? 'each PR' : 'the PR'} with \`gh pr comment <n> --body-file <file>\`, starting exactly:`,
    '',
    'Verifier verdict: <PASS|PASS+NOTES|FAIL> on base `<base-sha>`, head `<head-sha>`',
    'Sensitive: <yes|no>',
    '',
    'A FAIL adds a line `Failure shown: <command or test> on the head prints <what broke>`. Write `Sensitive: yes` when the PR touches a path in `scripts/quality/sensitive-paths.mjs` or affects sign-in, account data, migrations or release. Say you are a separate Claude agent, not a different model family, and name your model. Report each verdict and its comment URL.',
    '',
    'What the change is for: <one or two lines from the coordinator, with no other PR or issue number, which keeps the verifier on Opus>',
  ].join('\n');
}

const fields = [
  'number',
  'title',
  'isDraft',
  'headRefOid',
  'files',
  'comments',
  'statusCheckRollup',
].join(',');

function main() {
  const at = process.argv.indexOf('--brief');
  if (at !== -1) {
    const numbers = process.argv.slice(at + 1).map(Number);
    if (
      numbers.length === 0 ||
      numbers.some((n) => !Number.isInteger(n) || n < 1)
    )
      throw new Error('verify-batch: --brief takes one or more PR numbers');
    console.info(brief(numbers));
    return;
  }
  const pulls = JSON.parse(
    execFileSync(
      'gh',
      ['pr', 'list', '--state', 'open', '--limit', '200', '--json', fields],
      { encoding: 'utf8', timeout: 30000 },
    ),
  );
  const result = plan(pulls);
  console.info(
    process.argv.includes('--json')
      ? JSON.stringify(result, null, 2)
      : format(result),
  );
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  main();
