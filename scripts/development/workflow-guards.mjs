import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function validateFoundationChecks(value, sourceSha) {
  const run = value?.workflow_runs?.[0];
  if (
    !/^[a-f0-9]{40}$/.test(sourceSha ?? '') ||
    run?.head_sha !== sourceSha ||
    run.head_branch !== 'main' ||
    run.event !== 'push' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success'
  )
    throw new Error(
      'The latest Foundation main push for the reviewed source must pass.',
    );
}
export function validateSigningEnvironment(value) {
  if (
    value?.name !== 'testflight-beta' ||
    !value.protection_rules?.some(
      (rule) =>
        rule.type === 'required_reviewers' &&
        rule.reviewers?.some(
          (entry) =>
            Number.isSafeInteger(entry.reviewer?.id) && entry.reviewer.id > 0,
        ),
    ) ||
    value.deployment_branch_policy?.custom_branch_policies !== true
  )
    throw new Error(
      'The existing signing environment must retain owner review and branch protection.',
    );
}
if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    const [operation, path] = process.argv.slice(2);
    if (process.argv.length !== 4)
      throw new Error('Expected a workflow guard and metadata path.');
    const value = JSON.parse(await readFile(path, 'utf8'));
    if (operation === 'checks')
      validateFoundationChecks(value, process.env.RELEASE_SHA);
    else if (operation === 'environment') validateSigningEnvironment(value);
    else throw new Error('Unknown development workflow guard.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
