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

/** Register private device values before EAS prints its credential summary. */
export function deviceLogMasks(devices) {
  if (
    !Array.isArray(devices) ||
    devices.length === 0 ||
    devices.length >= 100 ||
    devices.some(
      (device) =>
        !/^(?:[a-fA-F0-9]{40}|[a-fA-F0-9]{8}-[a-fA-F0-9]{16})$/.test(
          device?.identifier ?? '',
        ) ||
        (device.name !== null &&
          device.name !== undefined &&
          typeof device.name !== 'string'),
    )
  ) {
    throw new Error(
      'Expected a complete, nonempty registered-device list before EAS logging.',
    );
  }
  const values = new Set(
    devices.flatMap((device) => [
      device.identifier,
      ...(device.name ? [device.name] : []),
    ]),
  );
  return [...values].map(
    (value) =>
      `::add-mask::${value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')}`,
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
    else if (operation === 'devices') {
      if (process.env.GITHUB_ACTIONS !== 'true')
        throw new Error(
          'Device masks may only be emitted to the GitHub runner.',
        );
      for (const command of deviceLogMasks(value)) console.info(command);
    } else throw new Error('Unknown development workflow guard.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
