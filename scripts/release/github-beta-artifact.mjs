import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  appendFile,
  lstat,
  readFile,
  readdir,
  writeFile,
} from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const workflowPath = '.github/workflows/testflight-beta.yml';
const ipaName = 'JustGO.ipa';
const manifestName = 'manifest.json';
const maxIpaBytes = 1024 ** 3;
const identity = {
  projectId: '53cf0560-8ab5-446a-9bc6-deb193b337b5',
  owner: 'anthonyyoos-team',
  bundleIdentifier: 'com.anthonyyoo.justgo',
  appleTeamId: 'NPDYTJS425',
  platform: 'IOS',
  distribution: 'STORE',
  buildProfile: 'beta',
  isForIosSimulator: false,
};

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function positiveId(value) {
  requireValue(
    /^(?:[1-9]\d*)$/.test(String(value)) && Number.isSafeInteger(Number(value)),
    'Expected a positive, exact GitHub identifier.',
  );
  return Number(value);
}

function sourceContext(env) {
  const repository = env.GITHUB_REPOSITORY;
  requireValue(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? ''),
    'Missing GitHub repository identity.',
  );
  requireValue(
    /^[a-f0-9]{40}$/.test(env.RELEASE_SHA ?? ''),
    'Missing reviewed source commit.',
  );
  requireValue(
    /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(env.RELEASE_TAG ?? ''),
    'Missing reviewed release tag.',
  );
  return {
    repository,
    repositoryId: positiveId(env.GITHUB_REPOSITORY_ID),
    sourceSha: env.RELEASE_SHA,
    releaseTag: env.RELEASE_TAG,
  };
}

export function betaArtifactName(runId, runAttempt) {
  return `justgo-ios-beta-${positiveId(runId)}-${positiveId(runAttempt)}`;
}

/** Trust GitHub's run metadata before accepting any artifact-supplied claims. */
export function selectBetaArtifact({ run, workflow, artifacts, env }) {
  const context = sourceContext(env);
  const runId = positiveId(env.RELEASE_BUILD_RUN_ID);
  requireValue(
    run?.id === runId &&
      workflow?.path === workflowPath &&
      run.path === workflowPath &&
      Number.isSafeInteger(workflow.id) &&
      workflow.id > 0 &&
      run.workflow_id === workflow.id &&
      run.repository?.id === context.repositoryId &&
      run.repository?.full_name === context.repository &&
      run.head_repository?.id === context.repositoryId &&
      run.head_repository?.full_name === context.repository &&
      run.event === 'workflow_dispatch' &&
      run.head_branch === 'main' &&
      /^[a-f0-9]{40}$/.test(run.head_sha ?? '') &&
      run.status === 'completed' &&
      run.conclusion === 'success',
    'The selected build must be a successful manual main run of this repository’s TestFlight workflow.',
  );
  const runAttempt = positiveId(run.run_attempt);
  const name = betaArtifactName(runId, runAttempt);
  requireValue(
    Array.isArray(artifacts?.artifacts) &&
      artifacts.total_count === artifacts.artifacts.length,
    'Artifact metadata must include the complete run artifact list.',
  );
  const matches = artifacts.artifacts.filter(
    (artifact) => artifact.name === name,
  );
  requireValue(
    matches.length === 1,
    'Expected exactly one artifact for this build attempt.',
  );
  const artifact = matches[0];
  requireValue(
    Number.isSafeInteger(artifact.id) &&
      artifact.id > 0 &&
      artifact.expired === false &&
      /^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? '') &&
      artifact.workflow_run?.id === runId &&
      artifact.workflow_run?.repository_id === context.repositoryId &&
      artifact.workflow_run?.head_repository_id === context.repositoryId &&
      artifact.workflow_run?.head_branch === 'main' &&
      artifact.workflow_run?.head_sha === run.head_sha,
    'The selected artifact must be unexpired and belong to the verified build run.',
  );
  return {
    ...context,
    runId,
    runAttempt,
    workflowSha: run.head_sha,
    artifactId: artifact.id,
    artifactName: name,
    artifactDigest: artifact.digest,
  };
}

async function fileDigest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function regularFile(path, maximumBytes) {
  const info = await lstat(path);
  requireValue(
    info.isFile() && info.size > 0 && info.size <= maximumBytes,
    'Artifact files must be regular, nonempty files within their size limits.',
  );
  return info;
}

async function requireFiles(directory, names) {
  const actual = (await readdir(directory)).sort();
  requireValue(
    JSON.stringify(actual) === JSON.stringify([...names].sort()),
    'Only the signed JustGO IPA and its manifest may enter the build artifact.',
  );
}

/** Record the already inspected IPA; the workflow supplies the trusted context. */
export async function recordBetaArtifact(directory, env) {
  const context = sourceContext(env);
  requireValue(
    /^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? ''),
    'Missing workflow commit.',
  );
  await requireFiles(directory, [ipaName]);
  const path = join(directory, ipaName);
  const info = await regularFile(path, maxIpaBytes);
  const manifest = {
    schemaVersion: 1,
    operation: 'build',
    ...identity,
    ...context,
    runId: positiveId(env.GITHUB_RUN_ID),
    runAttempt: positiveId(env.GITHUB_RUN_ATTEMPT),
    workflowSha: env.GITHUB_SHA,
    file: ipaName,
    size: info.size,
    sha256: await fileDigest(path),
  };
  await writeFile(
    join(directory, manifestName),
    `${JSON.stringify(manifest, null, 2)}\n`,
    {
      flag: 'wx',
      mode: 0o600,
    },
  );
  return manifest;
}

/** Verify the REST ZIP before extracting any paths or trusting its manifest. */
export async function verifyBetaArchive(path, selected) {
  await regularFile(path, maxIpaBytes + 1024 ** 2);
  requireValue(
    /^sha256:[a-f0-9]{64}$/.test(selected?.artifactDigest ?? '') &&
      `sha256:${await fileDigest(path)}` === selected.artifactDigest,
    'Downloaded artifact does not match GitHub’s SHA-256 digest.',
  );
  const entries = execFileSync('unzip', ['-Z1', path], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024,
    timeout: 10_000,
  })
    .trim()
    .split('\n')
    .sort();
  requireValue(
    JSON.stringify(entries) === JSON.stringify([ipaName, manifestName].sort()),
    'Artifact ZIP must contain exactly JustGO.ipa and manifest.json without directories.',
  );
}

export async function verifyBetaArtifact(directory, selected) {
  await requireFiles(directory, [ipaName, manifestName]);
  const ipaPath = join(directory, ipaName);
  const info = await regularFile(ipaPath, maxIpaBytes);
  await regularFile(join(directory, manifestName), 16 * 1024);
  const manifest = JSON.parse(
    await readFile(join(directory, manifestName), 'utf8'),
  );
  const expected = {
    schemaVersion: 1,
    operation: 'build',
    ...identity,
    repository: selected.repository,
    repositoryId: selected.repositoryId,
    sourceSha: selected.sourceSha,
    releaseTag: selected.releaseTag,
    runId: selected.runId,
    runAttempt: selected.runAttempt,
    workflowSha: selected.workflowSha,
    file: ipaName,
    size: info.size,
    sha256: await fileDigest(ipaPath),
  };
  requireValue(
    Object.keys(manifest).length === Object.keys(expected).length &&
      Object.entries(expected).every(
        ([name, value]) => manifest[name] === value,
      ),
    'The IPA and manifest must match the reviewed source, verified build attempt and JustGO identity.',
  );
  return manifest;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function selection(env) {
  const directory = env.RUNNER_TEMP;
  requireValue(directory, 'Missing temporary metadata directory.');
  return selectBetaArtifact({
    run: await readJson(join(directory, 'beta-run.json')),
    workflow: await readJson(join(directory, 'beta-workflow.json')),
    artifacts: await readJson(join(directory, 'beta-artifacts.json')),
    env,
  });
}

async function main() {
  const [operation, path] = process.argv.slice(2);
  requireValue(
    process.argv.length === 4 && path,
    'Expected an artifact operation and path.',
  );
  if (operation === 'record') {
    await recordBetaArtifact(path, process.env);
    return;
  }
  const selected = await selection(process.env);
  if (operation === 'select') {
    requireValue(
      path === process.env.RUNNER_TEMP,
      'Select must use the runner temporary directory.',
    );
    await writeFile(
      join(path, 'beta-selected-artifact.json'),
      `${JSON.stringify(selected)}\n`,
    );
    await appendFile(
      process.env.GITHUB_OUTPUT,
      [
        `artifact_id=${selected.artifactId}`,
        `artifact_name=${selected.artifactName}`,
        `artifact_digest=${selected.artifactDigest}`,
        `run_attempt=${selected.runAttempt}`,
        `workflow_sha=${selected.workflowSha}`,
        '',
      ].join('\n'),
    );
  } else if (operation === 'verify-archive') {
    await verifyBetaArchive(path, selected);
  } else if (operation === 'verify') {
    await verifyBetaArtifact(path, selected);
  } else {
    throw new Error('Unknown artifact operation.');
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
