import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  buildContext,
  recordDevelopmentArtifact,
  validateInstallReceipt,
  verifyDevelopmentArtifact,
} from './artifact.mjs';

const env = {
  GITHUB_REPOSITORY: 'anthonyyoo24/justgo',
  GITHUB_REPOSITORY_ID: '42',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  RELEASE_SHA: 'a'.repeat(40),
  GITHUB_WORKFLOW_SHA: 'b'.repeat(40),
  RELEASE_TAG: 'dev-reviewed',
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
  GITHUB_WORKFLOW_REF:
    'anthonyyoo24/justgo/.github/workflows/development-ios.yml@refs/heads/main',
  IOS_BUNDLE_IDENTIFIER: 'com.anthonyyoo.justgo.dev',
  EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER: 'iCloud.com.anthonyyoo.justgo.dev',
  ICLOUD_CONTAINER_ENVIRONMENT: 'Production',
  EXPO_PUBLIC_API_URL: 'https://justgo-two.vercel.app',
  EXPO_PUBLIC_SUPABASE_URL: 'https://kmcpcauaxlgpevkkenwd.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: '123-dev.apps.googleusercontent.com',
  EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME: 'com.googleusercontent.apps.123-dev',
  EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: '123-web.apps.googleusercontent.com',
  EXPO_PUBLIC_SENTRY_ENABLED: 'false',
  EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://justgo-legal.vercel.app/privacy/',
  EXPO_PUBLIC_TERMS_URL: 'https://justgo-legal.vercel.app/terms/',
};
test('provenance rejects foreign workflows, missing source and invalid run identity', () => {
  buildContext(env);
  for (const [key, value] of [
    ['GITHUB_REPOSITORY', 'other/repo'],
    ['GITHUB_EVENT_NAME', 'pull_request'],
    ['GITHUB_REF', 'refs/heads/feature'],
    ['RELEASE_SHA', 'main'],
    [
      'GITHUB_WORKFLOW_REF',
      'anthonyyoo24/justgo/.github/workflows/testflight-beta.yml@refs/heads/main',
    ],
    ['GITHUB_RUN_ID', ''],
    ['RELEASE_TAG', '$(injection)'],
  ])
    assert.throws(() => buildContext({ ...env, [key]: value }));
});
test('the exact inspected IPA, source and run must still match before hosting it', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'justgo-dev-artifact-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const ipa = join(directory, 'JustGO-Dev.ipa');
  await writeFile(ipa, 'inspected IPA bytes');
  const manifest = await recordDevelopmentArtifact(
    directory,
    env,
    async () => ({
      bundleIdentifier: 'com.anthonyyoo.justgo.dev',
      appleTeam: 'NPDYTJS425',
      distribution: 'internal',
      developmentClient: true,
      provisionedDeviceCount: 1,
    }),
  );
  assert.equal(
    (await verifyDevelopmentArtifact(directory, env)).sha256,
    manifest.sha256,
  );
  assert.ok(
    !(await readFile(join(directory, 'manifest.json'), 'utf8')).includes(
      'sb_publishable_',
    ),
  );
  await assert.rejects(
    verifyDevelopmentArtifact(directory, { ...env, GITHUB_RUN_ID: '999' }),
  );
  await writeFile(ipa, 'modified IPA');
  await assert.rejects(verifyDevelopmentArtifact(directory, env));
});
test('installation receipts accept only the existing Expo project and a single exact build URL', () => {
  const url =
    'https://expo.dev/accounts/anthonyyoos-team/projects/justgo/builds/dc7a7feb-c0d6-47a5-bd93-a42d100c211f';
  assert.deepEqual(validateInstallReceipt({ url }), { url });
  for (const receipt of [
    {},
    { url: url + '?token=sensitive' },
    { url: url.replace('anthonyyoos-team', 'other') },
    { url: url.replace('justgo/builds', 'another/builds') },
    { url: url.replace('https:', 'http:') },
    { url, extra: 'unexpected' },
  ])
    assert.throws(() => validateInstallReceipt(receipt));
});
