import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { isSensitivePath } from './sensitive-paths.mjs';
import { newestVerdictOf } from './merge-order.mjs';

// Lists the open PRs that can share one verifier, in batches. A PR qualifies
// when it needs a verdict, is not a draft, touches no sensitive path and no
// boundary file below, and changes at most `maxLines` lines outside tests.
// Every other PR keeps its own verifier. The verifier of a batch still posts a
// separate verdict comment on each PR, because the `verdict` check reads each
// PR's own comments.
//
// Usage: node scripts/quality/verify-batch.mjs [--json]

export const maxLines = 150;
export const maxBatchPulls = 4;
export const maxBatchLines = 300;

// Files whose change reaches past one capability: shared contracts, the
// database, CI, dependencies, and the hooks, settings, skills, lint config and
// quality scripts that enforce the agent rules.
const boundary = [
  /^packages\/contracts\//,
  /^apps\/api\/src\/db\//,
  /^apps\/api\/drizzle\//,
  /^\.github\//,
  /(^|\/)package(-lock)?\.json$/,
  /^\.nvmrc$/,
  /^\.claude\/hooks\//,
  /^\.claude\/settings\.json$/,
  /^\.claude\/skills\//,
  /^eslint\.config\.mjs$/,
  /^scripts\/quality\/(?![^/]+\.test\.mjs$)[^/]+\.mjs$/,
];

// Tests do not count toward the size. Markdown does, because AGENTS.md and the
// operations docs change what agents do.
const testFile = [
  /(^|\/)[^/]+\.(test|spec)\.[cm]?[jt]sx?$/,
  /(^|\/)(tests|__tests__)\//,
];

export const isBoundaryFile = (path) =>
  boundary.some((rule) => rule.test(path));
export const isTestFile = (path) => testFile.some((rule) => rule.test(path));

export function countedLines(files) {
  return files
    .filter((file) => !isTestFile(file.path))
    .reduce((sum, file) => sum + file.additions + file.deletions, 0);
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
  const files = pull.files ?? [];
  if (files.length === 0) return 'no files listed';
  const sensitive = files.find((file) => isSensitivePath(file.path));
  if (sensitive) return `sensitive path ${sensitive.path}`;
  const edge = files.find((file) => isBoundaryFile(file.path));
  if (edge) return `boundary file ${edge.path}`;
  const lines = countedLines(files);
  if (lines > maxLines)
    return `${lines} changed lines outside tests (limit ${maxLines})`;
  return undefined;
}

// Groups the qualifying PRs in number order. A batch closes when the next PR
// would pass either batch limit.
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
    if (
      last &&
      last.pulls.length < maxBatchPulls &&
      last.lines + lines <= maxBatchLines
    ) {
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
  return out.join('\n');
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
