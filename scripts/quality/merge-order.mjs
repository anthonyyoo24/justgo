import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { changedPaths } from './git.mjs';
import { newestVerdict } from './verdict-status.mjs';

// Plans the order for a batch of merges. PRs that change the same file merge
// one at a time, in flight (auto-merge armed) first, then the earliest PASS
// verdict, then the lowest number. PRs that share no file with another merge
// in any order. A stacked PR waits for the PR it targets. Shared files are a
// plan. scripts/quality/merge-pr.mjs, the only way agents merge, checks real
// conflicts with git merge-tree before each merge.
//
// Usage: node scripts/quality/merge-order.mjs [--json]

const listFields = [
  'number',
  'title',
  'baseRefName',
  'headRefName',
  'headRefOid',
  'isDraft',
  'autoMergeRequest',
  'comments',
].join(',');

export function openPulls(cwd) {
  return JSON.parse(
    execFileSync(
      'gh',
      ['pr', 'list', '--state', 'open', '--limit', '200', '--json', listFields],
      { cwd, encoding: 'utf8', timeout: 15000 },
    ),
  );
}

// Fetches main and each PR head by its exact commit, so a push between the
// listing and the fetch cannot swap in a head the listing did not name.
export function fetchHeads(heads, cwd) {
  execFileSync('git', ['fetch', '-q', 'origin', 'main', ...heads], {
    cwd,
    stdio: ['ignore', 'ignore', 'pipe'],
    timeout: 30000,
  });
  return execFileSync('git', ['rev-parse', 'origin/main'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

// The newest owner verdict, in the REST comment shape newestVerdict reads.
export function agreementOf(comments) {
  const shaped = (comments ?? []).map((comment) => ({
    author_association: comment.authorAssociation,
    body: comment.body,
    html_url: comment.url,
    created_at: comment.createdAt,
  }));
  const found = newestVerdict(shaped);
  if (!found || found.unreadable || found.verdict === 'FAIL') return undefined;
  const at = shaped.find(
    (comment) => comment.html_url === found.url,
  )?.created_at;
  return { at, head: found.head };
}

export function describe(pull, files) {
  const agreed = agreementOf(pull.comments);
  return {
    number: pull.number,
    title: pull.title,
    base: pull.baseRefName,
    branch: pull.headRefName,
    head: pull.headRefOid,
    draft: Boolean(pull.isDraft),
    inFlight: Boolean(pull.autoMergeRequest),
    agreedAt: agreed?.at,
    agreedStale: agreed ? !pull.headRefOid.startsWith(agreed.head) : false,
    files,
  };
}

// In flight first, then agreed (earliest first), then the lowest number.
export function byPriority(a, b) {
  if (a.inFlight !== b.inFlight) return a.inFlight ? -1 : 1;
  if (Boolean(a.agreedAt) !== Boolean(b.agreedAt)) return a.agreedAt ? -1 : 1;
  if (a.agreedAt && b.agreedAt && a.agreedAt !== b.agreedAt)
    return a.agreedAt < b.agreedAt ? -1 : 1;
  return a.number - b.number;
}

export function overlaps(prs) {
  const pairs = [];
  for (let i = 0; i < prs.length; i++)
    for (let j = i + 1; j < prs.length; j++) {
      const theirs = new Set(prs[j].files);
      const files = prs[i].files.filter((file) => theirs.has(file));
      if (files.length)
        pairs.push({ a: prs[i].number, b: prs[j].number, files });
    }
  return pairs;
}

export function plan(prs, base = 'main') {
  const onBase = prs.filter((pr) => pr.base === base);
  const stacked = prs
    .filter((pr) => pr.base !== base)
    .map((pr) => ({
      number: pr.number,
      after: prs.find((parent) => parent.branch === pr.base)?.number,
      base: pr.base,
    }));
  const pairs = overlaps(onBase);
  const parent = new Map(onBase.map((pr) => [pr.number, pr.number]));
  const root = (n) => (parent.get(n) === n ? n : root(parent.get(n)));
  for (const { a, b } of pairs) parent.set(root(a), root(b));
  const groups = new Map();
  for (const pr of onBase) {
    const key = root(pr.number);
    groups.set(key, [...(groups.get(key) ?? []), pr]);
  }
  const ordered = [...groups.values()].map((group) =>
    [...group].sort(byPriority),
  );
  return {
    sequences: ordered
      .filter((group) => group.length > 1)
      .sort((x, y) => byPriority(x[0], y[0]))
      .map((group) => group.map((pr) => pr.number)),
    independent: ordered
      .filter((group) => group.length === 1)
      .map(([pr]) => pr)
      .sort(byPriority)
      .map((pr) => pr.number),
    stacked,
    pairs,
  };
}

function label(pr) {
  const notes = [];
  if (pr.inFlight) notes.push('auto-merge armed');
  if (pr.agreedAt)
    notes.push(`PASS ${pr.agreedAt}${pr.agreedStale ? ', older head' : ''}`);
  if (pr.draft) notes.push('draft');
  return `#${pr.number} ${pr.title}${notes.length ? ` (${notes.join('; ')})` : ''}`;
}

export function format(result, prs) {
  const byNumber = new Map(prs.map((pr) => [pr.number, pr]));
  const lines = [];
  lines.push('Shared files:');
  if (!result.pairs.length) lines.push('  none');
  for (const { a, b, files } of result.pairs)
    lines.push(`  #${a} and #${b}: ${files.join(', ')}`);
  lines.push('', 'One at a time, in this order (recheck after each merge):');
  if (!result.sequences.length) lines.push('  none');
  result.sequences.forEach((sequence, i) => {
    lines.push(`  Group ${i + 1}:`);
    sequence.forEach((n, step) =>
      lines.push(`    ${step + 1}. ${label(byNumber.get(n))}`),
    );
  });
  lines.push('', 'Any order (no shared files):');
  if (!result.independent.length) lines.push('  none');
  for (const n of result.independent) lines.push(`  ${label(byNumber.get(n))}`);
  if (result.stacked.length) {
    lines.push('', 'Stacked (merge after the PR they target):');
    for (const { number, after, base } of result.stacked)
      lines.push(
        `  ${label(byNumber.get(number))} after ${after ? `#${after}` : base}`,
      );
  }
  return lines.join('\n');
}

export function collect(cwd) {
  const pulls = openPulls(cwd);
  const main = fetchHeads(
    pulls.map((pull) => pull.headRefOid),
    cwd,
  );
  return pulls.map((pull) => {
    const parent = pulls.find(
      (other) => other.headRefName === pull.baseRefName,
    );
    const from = parent ? parent.headRefOid : main;
    return describe(pull, changedPaths(`${from}...${pull.headRefOid}`, cwd));
  });
}

function main() {
  const prs = collect(process.cwd());
  const result = plan(prs);
  process.stdout.write(
    process.argv.includes('--json')
      ? `${JSON.stringify({ ...result, prs }, null, 2)}\n`
      : `${format(result, prs)}\n`,
  );
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self))
  main();
