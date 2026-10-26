import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  developmentEnvironment,
  developmentIdentity,
} from './configuration.mjs';
import { inspectDevelopmentIpa } from './inspect-ipa.mjs';

function check(condition, message) {
  if (!condition) throw new Error(message);
}
export function buildContext(env) {
  check(
    env.GITHUB_REPOSITORY === 'anthonyyoo24/justgo' &&
      /^[1-9]\d*$/.test(env.GITHUB_REPOSITORY_ID ?? '') &&
      env.GITHUB_EVENT_NAME === 'workflow_dispatch' &&
      env.GITHUB_REF === 'refs/heads/main',
    'Expected this repository’s approved manual main workflow.',
  );
  check(
    /^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? '') &&
      /^[a-f0-9]{40}$/.test(env.GITHUB_WORKFLOW_SHA ?? '') &&
      /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(env.RELEASE_TAG ?? ''),
    'Missing exact reviewed source identity.',
  );
  check(
    /^[1-9]\d*$/.test(env.GITHUB_RUN_ID ?? '') &&
      /^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT ?? '') &&
      env.GITHUB_WORKFLOW_REF ===
        `${env.GITHUB_REPOSITORY}/.github/workflows/development-ios.yml@refs/heads/main`,
    'Missing development workflow identity.',
  );
  return {
    repository: env.GITHUB_REPOSITORY,
    repositoryId: env.GITHUB_REPOSITORY_ID,
    sourceSha: env.RELEASE_SHA,
    tag: env.RELEASE_TAG,
    workflowSha: env.GITHUB_WORKFLOW_SHA,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
  };
}
async function digest(path) {
  const stat = await lstat(path);
  check(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.size > 0 &&
      stat.size < 1024 ** 3,
    'Expected a bounded, nonempty regular IPA file.',
  );
  const hash = createHash('sha256');
  for await (const data of createReadStream(path)) hash.update(data);
  return { size: stat.size, sha256: hash.digest('hex') };
}
export async function recordDevelopmentArtifact(
  directory,
  env,
  inspect = inspectDevelopmentIpa,
) {
  const environment = await developmentEnvironment(env);
  const context = buildContext(env);
  const ipa = join(directory, 'JustGO-Dev.ipa');
  const metadata = await inspect(
    ipa,
    environment.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME,
  );
  const manifest = {
    schemaVersion: 1,
    ...context,
    projectId: developmentIdentity.projectId,
    ...metadata,
    file: 'JustGO-Dev.ipa',
    ...(await digest(ipa)),
  };
  await writeFile(
    join(directory, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
  return manifest;
}
export async function verifyDevelopmentArtifact(directory, env) {
  const context = buildContext(env);
  const manifest = JSON.parse(
    await readFile(join(directory, 'manifest.json'), 'utf8'),
  );
  const actual = await digest(join(directory, 'JustGO-Dev.ipa'));
  check(
    manifest.schemaVersion === 1 &&
      manifest.file === 'JustGO-Dev.ipa' &&
      manifest.projectId === developmentIdentity.projectId &&
      manifest.bundleIdentifier === developmentIdentity.bundle &&
      manifest.appleTeam === developmentIdentity.team &&
      manifest.distribution === 'internal' &&
      manifest.developmentClient === true &&
      Object.entries({ ...context, ...actual }).every(
        ([key, value]) => manifest[key] === value,
      ),
    'Development IPA no longer matches its inspected source/run manifest.',
  );
  return manifest;
}
export function validateInstallReceipt(receipt) {
  check(
    receipt &&
      Object.keys(receipt).length === 1 &&
      typeof receipt.url === 'string' &&
      /^https:\/\/expo\.dev\/accounts\/anthonyyoos-team\/projects\/justgo\/builds\/[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(
        receipt.url,
      ),
    'Expo upload did not return an installation page for the existing project.',
  );
  return receipt;
}

async function main() {
  const [operation, directory] = process.argv.slice(2);
  check(
    process.argv.length === 4 && directory,
    'Expected development artifact operation and directory.',
  );
  if (operation === 'record') {
    check(
      execFileSync('git', ['rev-parse', 'HEAD'], {
        encoding: 'utf8',
      }).trim() === process.env.RELEASE_SHA &&
        execFileSync('git', ['status', '--porcelain'], {
          encoding: 'utf8',
        }).trim() === '',
      'Expected clean reviewed source.',
    );
    await recordDevelopmentArtifact(directory, process.env);
  } else if (operation === 'verify')
    await verifyDevelopmentArtifact(directory, process.env);
  else if (operation === 'receipt') {
    await verifyDevelopmentArtifact(directory, process.env);
    const receipt = validateInstallReceipt(
      JSON.parse(await readFile(join(directory, 'install.json'), 'utf8')),
    );
    console.info(`Install JustGO Dev: ${receipt.url}`);
  } else throw new Error('Unknown development artifact operation.');
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
