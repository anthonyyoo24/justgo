import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { changedPaths } from './git.mjs';
import { isSensitivePath, sensitiveFlag } from './sensitive-paths.mjs';
import { newestVerdict } from './verdict-status.mjs';
import { compare, filePatches } from './verdict-patch.mjs';

// The findings are everything in the verdict comment after its verdict line.
export function findingsOf(body) {
  const lines = body.split('\n');
  const at = lines.findLastIndex((line) => /Verifier verdict:/.test(line));
  return lines
    .slice(at + 1)
    .join('\n')
    .trim();
}

export function buildBrief({
  pr,
  verdict,
  findings,
  head,
  result,
  rebased,
  sensitive,
  diff,
}) {
  const full = sensitive || (result === 're-verify' && rebased);
  const why = sensitive
    ? 'The PR is sensitive.'
    : 'verdict-patch says re-verify and the branch was rebased since the verdict.';
  const quoted = findings
    ? findings
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n')
    : '> (The verdict comment lists no findings.)';
  return [
    `# Re-check brief for PR #${pr}`,
    '',
    `The newest verdict is ${verdict.verdict} on base \`${verdict.base}\`, head \`${verdict.head}\` (${verdict.url}). The PR head is now \`${head}\`. verdict-patch: ${result}.`,
    '',
    full
      ? `## Scope: full re-read\n\n${why} Read the whole PR diff against its base, not only the change below.`
      : '## Scope: the change since the verdict',
    '',
    '## Earlier findings',
    '',
    quoted,
    '',
    '## What to do',
    '',
    '1. Check that each finding above is fixed, or that its note still holds.',
    '2. Follow the callers and callees of every changed line below, and check the change did not break them.',
    "3. Rerun the PR's own checks for the touched paths (AGENTS.md, Choosing checks).",
    '4. Post a fresh verdict line on the current head.',
    '',
    `## Diff from the verdict head to \`${head}\``,
    '',
    '```diff',
    diff.trimEnd(),
    '```',
    '',
  ].join('\n');
}

function git(args) {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const pr = process.argv[2];
  if (!/^\d+$/.test(pr ?? '')) {
    console.error('Usage: node scripts/quality/recheck-brief.mjs <pr-number>');
    process.exit(2);
  }
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });
  const comments = JSON.parse(
    gh(
      'api',
      '--paginate',
      '--slurp',
      `repos/{owner}/{repo}/issues/${pr}/comments`,
    ),
  ).flat();
  const verdict = newestVerdict(comments);
  if (!verdict || verdict.unreadable) {
    console.error(
      'No readable verdict on this PR. Run a first verifier instead.',
    );
    process.exit(1);
  }
  const body = comments.find((c) => c.html_url === verdict.url).body;
  const { baseRefOid: base, headRefOid: head } = JSON.parse(
    gh('pr', 'view', pr, '--json', 'baseRefOid,headRefOid'),
  );
  git(['fetch', '--quiet', '--no-tags', 'origin', base, head]);
  const vBase = git(['rev-parse', verdict.base]).trim();
  const vHead = git(['rev-parse', verdict.head]).trim();
  const { result } = compare(
    filePatches(vBase, vHead),
    filePatches(base, head),
  );
  let rebased = false;
  try {
    git(['merge-base', '--is-ancestor', vHead, head]);
  } catch {
    rebased = true;
  }
  const sensitive =
    sensitiveFlag.test(body) ||
    changedPaths(`${base}...${head}`).some(isSensitivePath);
  process.stdout.write(
    buildBrief({
      pr,
      verdict,
      findings: findingsOf(body),
      head,
      result,
      rebased,
      sensitive,
      diff: git(['diff', '--no-renames', vHead, head]),
    }),
  );
}
