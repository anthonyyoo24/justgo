import assert from 'node:assert/strict';
import test from 'node:test';
import { workerConfiguration } from '../../apps/api/cloudflare-config.mjs';

const input = {
  environment: 'staging',
  accountId: 'a'.repeat(32),
  hyperdriveId: 'b'.repeat(32),
  sourceSha: 'c'.repeat(40),
};
test('Workers targets separate environments and preserve private diagnostics and managed Auth', () => {
  const staging = workerConfiguration(input);
  const production = workerConfiguration({
    ...input,
    environment: 'production',
    hyperdriveId: 'd'.repeat(32),
  });
  assert.equal(staging.name, 'justgo-api-staging');
  assert.equal(production.name, 'justgo-api-production');
  assert.notDeepEqual(staging.hyperdrive, production.hyperdrive);
  assert.deepEqual(staging.placement, { region: 'aws:ca-central-1' });
  assert.deepEqual(staging.observability, { enabled: false });
  assert.equal(staging.vars.MANAGED_AUTH_ENABLED, 'true');
  assert.equal(staging.vars.JUSTGO_SOURCE_SHA, input.sourceSha);
  assert.equal(staging.preview_urls, true);
  assert.deepEqual(staging.compatibility_flags, ['nodejs_compat']);
  assert.ok(staging.main.endsWith('/apps/api/src/worker.ts'));
});
test('Workers configuration fails closed on unknown targets and absent or invalid account, database and source identity', () => {
  for (const field of Object.keys(input)) {
    for (const value of [undefined, '', '../production', ' ']) {
      assert.throws(
        () => workerConfiguration({ ...input, [field]: value }),
        /Invalid Cloudflare/,
      );
    }
  }
});
