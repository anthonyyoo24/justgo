import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  betaArtifactName,
  recordBetaArtifact,
  selectBetaArtifact,
  verifyBetaArchive,
  verifyBetaArtifact,
} from './github-beta-artifact.mjs';

const repository = 'anthonyyoo24/justgo';
const repositoryId = 1374886717;
const sourceSha = 'a'.repeat(40);
const workflowSha = 'b'.repeat(40);
const env = {
  GITHUB_REPOSITORY: repository,
  GITHUB_REPOSITORY_ID: String(repositoryId),
  GITHUB_RUN_ID: '12345678901',
  GITHUB_RUN_ATTEMPT: '2',
  GITHUB_SHA: workflowSha,
  RELEASE_BUILD_RUN_ID: '12345678901',
  RELEASE_SHA: sourceSha,
  RELEASE_TAG: 'beta-reviewed',
};
const workflow = { id: 42, path: '.github/workflows/testflight-beta.yml' };
const run = {
  id: Number(env.GITHUB_RUN_ID),
  workflow_id: workflow.id,
  path: workflow.path,
  repository: { id: repositoryId, full_name: repository },
  head_repository: { id: repositoryId, full_name: repository },
  event: 'workflow_dispatch',
  head_branch: 'main',
  head_sha: workflowSha,
  status: 'completed',
  conclusion: 'success',
  run_attempt: 2,
};
const artifact = {
  id: 6789,
  name: betaArtifactName(run.id, run.run_attempt),
  expired: false,
  digest: `sha256:${'c'.repeat(64)}`,
  workflow_run: {
    id: run.id,
    repository_id: repositoryId,
    head_repository_id: repositoryId,
    head_branch: 'main',
    head_sha: workflowSha,
  },
};
const artifacts = { total_count: 1, artifacts: [artifact] };
const selection = (overrides = {}) =>
  selectBetaArtifact({ run, workflow, artifacts, env, ...overrides });

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'justgo-beta-artifact-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function recorded(t) {
  const directory = await temporary(t);
  // Synthetic bytes exercise the artifact gate; native signing has its own check.
  await writeFile(
    join(directory, 'JustGO.ipa'),
    'synthetic signed-app fixture\n',
  );
  const manifest = await recordBetaArtifact(directory, env);
  return { directory, manifest, selected: selection() };
}

test('selects only the exact successful main workflow run and current attempt artifact', () => {
  const selected = selection();
  assert.equal(selected.sourceSha, sourceSha);
  assert.equal(selected.workflowSha, workflowSha);
  assert.notEqual(selected.sourceSha, selected.workflowSha);
  assert.equal(selected.runId, run.id);
  assert.equal(selected.runAttempt, 2);
  assert.equal(selected.artifactId, artifact.id);
  assert.equal(selected.artifactDigest, artifact.digest);
  // Older attempts can remain on the run, but cannot satisfy this attempt's name.
  assert.deepEqual(
    selection({
      artifacts: {
        total_count: 2,
        artifacts: [
          { ...artifact, id: 6788, name: betaArtifactName(run.id, 1) },
          artifact,
        ],
      },
    }),
    selected,
  );
});

test('rejects unrelated, forked, unfinished, failed and differently triggered build runs', () => {
  for (const patch of [
    { id: run.id + 1 },
    { workflow_id: workflow.id + 1 },
    { path: '.github/workflows/ci.yml' },
    { repository: { ...run.repository, id: repositoryId + 1 } },
    { repository: { ...run.repository, full_name: 'other/justgo' } },
    { head_repository: { ...run.head_repository, id: repositoryId + 1 } },
    { head_repository: { ...run.head_repository, full_name: 'fork/justgo' } },
    { event: 'pull_request' },
    { event: 'workflow_run' },
    { head_branch: 'codex/unreviewed' },
    { head_sha: '' },
    { status: 'in_progress' },
    { conclusion: 'failure' },
    { conclusion: 'cancelled' },
    { run_attempt: undefined },
    { run_attempt: 0 },
  ])
    assert.throws(() => selection({ run: { ...run, ...patch } }));
  for (const patch of [{ id: 0 }, { path: '.github/workflows/ci.yml' }]) {
    assert.throws(() => selection({ workflow: { ...workflow, ...patch } }));
  }
});

test('rejects ambiguous, stale, digestless and wrongly owned artifacts', () => {
  for (const patch of [
    { id: 0 },
    { name: betaArtifactName(run.id, 1) },
    { expired: true },
    { expired: undefined },
    { digest: undefined },
    { digest: 'sha256:incomplete' },
    { workflow_run: { ...artifact.workflow_run, id: run.id + 1 } },
    {
      workflow_run: {
        ...artifact.workflow_run,
        repository_id: repositoryId + 1,
      },
    },
    {
      workflow_run: {
        ...artifact.workflow_run,
        head_repository_id: repositoryId + 1,
      },
    },
    { workflow_run: { ...artifact.workflow_run, head_branch: 'feature' } },
    { workflow_run: { ...artifact.workflow_run, head_sha: sourceSha } },
  ])
    assert.throws(() =>
      selection({
        artifacts: {
          total_count: 1,
          artifacts: [{ ...artifact, ...patch }],
        },
      }),
    );
  for (const value of [
    {},
    { total_count: 0, artifacts: [] },
    { total_count: 2, artifacts: [artifact] },
    { total_count: 2, artifacts: [artifact, { ...artifact, id: 6790 }] },
  ])
    assert.throws(() => selection({ artifacts: value }));
});

test('requires exact safe GitHub context before recording or selecting artifacts', async (t) => {
  const directory = await temporary(t);
  await writeFile(join(directory, 'JustGO.ipa'), 'fixture');
  for (const patch of [
    { GITHUB_REPOSITORY: '' },
    { GITHUB_REPOSITORY: 'owner/repo/extra' },
    { GITHUB_REPOSITORY_ID: '' },
    { GITHUB_REPOSITORY_ID: '-1' },
    { GITHUB_REPOSITORY_ID: '9007199254740992' },
    { RELEASE_SHA: '' },
    { RELEASE_SHA: 'main' },
    { RELEASE_TAG: '' },
    { RELEASE_TAG: 'beta; injected' },
  ]) {
    assert.throws(() => selection({ env: { ...env, ...patch } }));
    await assert.rejects(recordBetaArtifact(directory, { ...env, ...patch }));
  }
  await assert.rejects(
    recordBetaArtifact(directory, { ...env, GITHUB_SHA: '' }),
  );
  await assert.rejects(
    recordBetaArtifact(directory, { ...env, GITHUB_RUN_ID: '1e3' }),
  );
  await assert.rejects(
    recordBetaArtifact(directory, { ...env, GITHUB_RUN_ATTEMPT: '0' }),
  );
  assert.throws(() =>
    selection({ env: { ...env, RELEASE_BUILD_RUN_ID: '--latest' } }),
  );
});

test('records and verifies byte identity together with source and build provenance', async (t) => {
  const { directory, manifest, selected } = await recorded(t);
  assert.deepEqual(await verifyBetaArtifact(directory, selected), manifest);
  assert.equal(
    manifest.sha256,
    createHash('sha256').update('synthetic signed-app fixture\n').digest('hex'),
  );
  assert.equal(manifest.workflowSha, workflowSha);
  assert.equal(manifest.sourceSha, sourceSha);
  assert.equal(manifest.buildProfile, 'beta');
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.diagnosticsEnabled, false);
  assert.equal(manifest.distribution, 'STORE');
  await assert.rejects(recordBetaArtifact(directory, env));
  await writeFile(join(directory, 'JustGO.ipa'), 'altered app fixture\n');
  await assert.rejects(verifyBetaArtifact(directory, selected));
});

test('rejects a substituted app, source, tag, workflow, run, attempt or malformed manifest', async (t) => {
  const { directory, manifest, selected } = await recorded(t);
  for (const [name, value] of Object.entries({
    schemaVersion: 3,
    operation: 'submit',
    projectId: 'other-app',
    owner: 'other-owner',
    bundleIdentifier: 'dev.justgo.foundation',
    appleTeamId: 'OTHERTEAM',
    platform: 'ANDROID',
    distribution: 'INTERNAL',
    buildProfile: 'production',
    isForIosSimulator: true,
    repository: 'fork/justgo',
    repositoryId: repositoryId + 1,
    sourceSha: workflowSha,
    releaseTag: 'unreviewed-beta',
    runId: run.id + 1,
    runAttempt: 1,
    workflowSha: sourceSha,
    file: '../JustGO.ipa',
    size: manifest.size + 1,
    sha256: 'd'.repeat(64),
    credentials: 'must never be included',
  })) {
    await writeFile(
      join(directory, 'manifest.json'),
      JSON.stringify({ ...manifest, [name]: value }),
    );
    await assert.rejects(
      verifyBetaArtifact(directory, selected),
      undefined,
      name,
    );
  }
  for (const value of [null, [], {}, { ...manifest, sha256: undefined }]) {
    await writeFile(join(directory, 'manifest.json'), JSON.stringify(value));
    await assert.rejects(verifyBetaArtifact(directory, selected));
  }
});

test('diagnostics provenance preserves exact bytes and mode without requiring pre-upload phone acceptance', async (t) => {
  const directory = await temporary(t);
  await writeFile(join(directory, 'JustGO.ipa'), 'synthetic diagnostics app');
  const modeEnv = { ...env, RELEASE_DIAGNOSTICS: 'true' };
  const manifest = await recordBetaArtifact(directory, modeEnv);
  assert.equal(manifest.buildProfile, 'beta-diagnostics');
  assert.equal(manifest.diagnosticsEnabled, true);
  const selected = selection({ env: modeEnv });
  assert.deepEqual(await verifyBetaArtifact(directory, selected), manifest);
  await assert.rejects(verifyBetaArtifact(directory, selection()));
  await assert.rejects(
    verifyBetaArtifact(directory, { ...selected, buildProfile: 'beta' }),
  );
  await writeFile(join(directory, 'JustGO.ipa'), 'substituted diagnostics app');
  await assert.rejects(verifyBetaArtifact(directory, selected));
});

test('original schema-one artifacts remain valid only on the diagnostics-off route', async (t) => {
  const { directory, manifest, selected } = await recorded(t);
  const legacy = { ...manifest, schemaVersion: 1 };
  delete legacy.diagnosticsEnabled;
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(legacy));
  assert.deepEqual(await verifyBetaArtifact(directory, selected), legacy);
  await assert.rejects(
    verifyBetaArtifact(directory, {
      ...selected,
      diagnosticsEnabled: true,
      buildProfile: 'beta-diagnostics',
    }),
  );
});

test('artifact boundaries reject extra files, empty apps and symlinks', async (t) => {
  const { directory, manifest, selected } = await recorded(t);
  await writeFile(
    join(directory, 'private-key.p8'),
    'synthetic forbidden file',
  );
  await assert.rejects(verifyBetaArtifact(directory, selected));
  await rm(join(directory, 'private-key.p8'));
  await writeFile(join(directory, 'JustGO.ipa'), '');
  await assert.rejects(verifyBetaArtifact(directory, selected));
  await rm(join(directory, 'JustGO.ipa'));
  await symlink(
    join(directory, 'manifest.json'),
    join(directory, 'JustGO.ipa'),
  );
  await assert.rejects(verifyBetaArtifact(directory, selected));
  await rm(join(directory, 'JustGO.ipa'));
  await writeFile(
    join(directory, 'JustGO.ipa'),
    'synthetic signed-app fixture\n',
  );
  await rm(join(directory, 'manifest.json'));
  const outside = await temporary(t);
  await writeFile(join(outside, 'elsewhere.json'), JSON.stringify(manifest));
  await symlink(
    join(outside, 'elsewhere.json'),
    join(directory, 'manifest.json'),
  );
  await assert.rejects(verifyBetaArtifact(directory, selected));
});

test('verifies the REST archive digest and exact ZIP file allowlist before extraction', async (t) => {
  const { directory } = await recorded(t);
  const outside = await temporary(t);
  const path = join(outside, 'artifact.zip');
  const zip = (entries) => {
    const result = spawnSync('zip', ['-q', path, ...entries], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
  };
  const digest = async () => ({
    artifactDigest: `sha256:${createHash('sha256')
      .update(await readFile(path))
      .digest('hex')}`,
  });
  zip(['JustGO.ipa', 'manifest.json']);
  await verifyBetaArchive(path, await digest());
  await assert.rejects(
    verifyBetaArchive(path, { artifactDigest: `sha256:${'0'.repeat(64)}` }),
  );
  await assert.rejects(verifyBetaArchive(path, {}));
  await mkdir(join(directory, 'nested'));
  await writeFile(join(directory, 'nested', 'unexpected.txt'), 'unexpected');
  zip(['nested/unexpected.txt']);
  await assert.rejects(verifyBetaArchive(path, await digest()));
});

test('CLI selects trusted metadata and verifies the artifact using that metadata again', async (t) => {
  const { directory, manifest } = await recorded(t);
  const metadata = await temporary(t);
  await Promise.all([
    writeFile(join(metadata, 'beta-run.json'), JSON.stringify(run)),
    writeFile(join(metadata, 'beta-workflow.json'), JSON.stringify(workflow)),
    writeFile(join(metadata, 'beta-artifacts.json'), JSON.stringify(artifacts)),
  ]);
  const output = join(metadata, 'output');
  const command = (operation, path) =>
    spawnSync(
      process.execPath,
      [
        new URL('./github-beta-artifact.mjs', import.meta.url).pathname,
        operation,
        path,
      ],
      {
        env: {
          ...process.env,
          ...env,
          RUNNER_TEMP: metadata,
          GITHUB_OUTPUT: output,
        },
        encoding: 'utf8',
      },
    );
  const selected = command('select', metadata);
  assert.equal(selected.status, 0, selected.stderr);
  assert.match(
    await readFile(output, 'utf8'),
    new RegExp(`artifact_id=${artifact.id}\\n`),
  );
  assert.equal(command('verify', directory).status, 0);
  await writeFile(
    join(metadata, 'beta-run.json'),
    JSON.stringify({ ...run, conclusion: 'failure' }),
  );
  assert.notEqual(command('verify', directory).status, 0);
  assert.notEqual(command('unknown', directory).status, 0);
  assert.equal(
    JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')).sha256,
    manifest.sha256,
  );
});
