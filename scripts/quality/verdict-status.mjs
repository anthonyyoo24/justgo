import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const verdictLine =
  /^[ \t]*\**Verifier verdict:[ \t]*\**(PASS\+NOTES|PASS|FAIL)\**[ \t]+on base `([0-9a-f]{7,40})`, head `([0-9a-f]{7,40})`/gm;
// A comment that talks about a verdict in any other shape, such as a heading or
// prose, is unreadable and fails the check instead of being skipped.
const verdictMention = /verifier[\s*_]+verdicts?|\bverdicts?[ \t*_]*:/i;
// Every verdict also says whether the change is sensitive, on a line of its own.
const sensitiveLine = /^[ \t]*\**Sensitive:\**[ \t]*\**(yes|no)\**[ \t]*$/gim;
// Only a shown defect blocks. A FAIL also names the check that broke on the
// head and what it printed, on a line of its own.
const failureLine = /^[ \t]*\**Failure shown:[ \t*]*[^\s*]/im;
export const verdictFormat =
  'Verifier verdict: PASS|PASS+NOTES|FAIL on base `<base-sha>`, head `<head-sha>`, followed by a line `Sensitive: yes` or `Sensitive: no`, and for a FAIL a line `Failure shown: <the command or test that broke on the head, and what it printed>`';
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
    const flag = [...body.matchAll(sensitiveLine)].at(-1);
    if (match && flag) {
      const [, verdict, base, head] = match;
      return {
        verdict,
        base,
        head,
        sensitive: flag[1].toLowerCase() === 'yes',
        ...(verdict === 'FAIL' && { failureShown: failureLine.test(body) }),
        url: comment.html_url,
      };
    }
    if (match) return { unreadable: true, url: comment.html_url };
    if (verdictMention.test(body))
      return { unreadable: true, url: comment.html_url };
  }
}

export function verdictStatus(comments, pr, check) {
  const found = newestVerdict(comments);
  if (!found)
    return {
      ok: false,
      message: `No verdict comment yet. Waiting for an independent verdict on head ${pr.head}, posted from the owner account as lines of the form: ${verdictFormat}`,
    };
  if (found.unreadable)
    return {
      ok: false,
      message: `The newest verdict comment (${found.url}) is unreadable. Post the verdict on head ${pr.head} as lines of exactly this form: ${verdictFormat}`,
    };
  const named = `The newest verdict (${found.url}) is ${found.verdict} on base ${found.base}, head ${found.head}.`;
  const rerun = `Then rerun this check with \`gh run rerun ${pr.runId ?? '<run-id>'} --failed\`.`;
  if (found.verdict === 'FAIL' && !found.failureShown)
    return {
      ok: false,
      message: `${named} It has no \`Failure shown:\` line, so it shows no defect. Only a shown defect blocks a PR. Post a fresh verdict on head ${pr.head}: a FAIL with a line \`Failure shown: <the command or test that broke on the head, and what it printed>\`, or PASS+NOTES with each note filed as an issue or left for a follow-up PR. ${rerun}`,
    };
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

export function runVerdictPatch(refs, cwd, timeout) {
  return spawnSync(process.execPath, [verdictPatch, 'check', ...refs], {
    cwd,
    encoding: 'utf8',
    timeout,
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
