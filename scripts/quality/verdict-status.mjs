import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const verdictLine =
  /^[ \t]*\**Verifier verdict:[ \t]*\**(PASS\+NOTES|PASS|FAIL)\**[ \t]+on base `([0-9a-f]{7,40})`, head `([0-9a-f]{7,40})`/gm;
// A comment that talks about a verdict in any other shape, such as a heading or
// prose, is unreadable and fails the check instead of being skipped.
const verdictMention = /verifier[\s*_]+verdicts?|\bverdicts?[ \t*_]*:/i;
export const verdictFormat =
  'Verifier verdict: PASS|PASS+NOTES|FAIL on base `<base-sha>`, head `<head-sha>`';
const verdictPatch = fileURLToPath(
  new URL('./verdict-patch.mjs', import.meta.url),
);

// Agents post through the owner's account. A verdict from anyone else is ignored.
// The newest owner comment that mentions a verdict decides. It either carries a
// canonical line or is reported as unreadable.
export function newestVerdict(comments) {
  for (const comment of [...comments].reverse()) {
    if (comment.author_association !== 'OWNER') continue;
    const body = comment.body ?? '';
    const match = [...body.matchAll(verdictLine)].at(-1);
    if (match) {
      const [, verdict, base, head] = match;
      return { verdict, base, head, url: comment.html_url };
    }
    if (verdictMention.test(body))
      return { unreadable: true, url: comment.html_url };
  }
}

export function verdictStatus(comments, pr, check) {
  const found = newestVerdict(comments);
  if (!found)
    return {
      ok: false,
      message: `No verdict comment yet. Waiting for an independent verdict on head ${pr.head}, posted from the owner account as a line of the form: ${verdictFormat}`,
    };
  if (found.unreadable)
    return {
      ok: false,
      message: `The newest verdict comment (${found.url}) is unreadable. Post the verdict on head ${pr.head} as a line of exactly this form: ${verdictFormat}`,
    };
  const named = `The newest verdict (${found.url}) is ${found.verdict} on base ${found.base}, head ${found.head}.`;
  const rerun = `Then rerun this check with \`gh run rerun ${pr.runId ?? '<run-id>'} --failed\`.`;
  if (found.verdict === 'FAIL')
    return {
      ok: false,
      message: `${named} Fix the findings and get a fresh independent verdict on head ${pr.head}. ${rerun}`,
    };
  const { status, stdout, stderr } = check(
    found.base,
    found.head,
    pr.base,
    pr.head,
  );
  const result = stdout.split('\n')[0];
  const report = `${named}\nverdict-patch check against base ${pr.base}, head ${pr.head}:\n${(stdout + stderr).trim()}`;
  if (status === 0 && ['carries', 'docs-tests-only'].includes(result))
    return { ok: true, message: report };
  if (status === 1 && result === 're-verify')
    return {
      ok: false,
      message: `${report}\nThe verdict no longer covers the head. Get a fresh independent verdict on head ${pr.head}. ${rerun}`,
    };
  return { ok: false, message: `${report}\nverdict-patch failed.` };
}

export function runVerdictPatch(refs, cwd) {
  return spawnSync(process.execPath, [verdictPatch, 'check', ...refs], {
    cwd,
    encoding: 'utf8',
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { GITHUB_REPOSITORY, PR_NUMBER, BASE_SHA, HEAD_SHA, GITHUB_RUN_ID } =
    process.env;
  const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' });
  const comments = JSON.parse(
    gh(
      'api',
      '--paginate',
      '--slurp',
      `repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments`,
    ),
  ).flat();
  const { ok, message } = verdictStatus(
    comments,
    { base: BASE_SHA, head: HEAD_SHA, runId: GITHUB_RUN_ID },
    (...refs) => {
      // Verdict lines carry short SHAs, and git fetches only full ones.
      const full = refs.map((ref) =>
        gh(
          'api',
          `repos/${GITHUB_REPOSITORY}/commits/${ref}`,
          '--jq',
          '.sha',
        ).trim(),
      );
      execFileSync('git', [
        'fetch',
        '--quiet',
        '--no-tags',
        '--filter=blob:none',
        'origin',
        ...new Set(full),
      ]);
      return runVerdictPatch(full);
    },
  );
  if (ok) console.info(message);
  else {
    console.error(message);
    process.exitCode = 1;
  }
}
