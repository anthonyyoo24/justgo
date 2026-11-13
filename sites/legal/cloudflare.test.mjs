import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { requireCloudflareNotice } from './cloudflare.mjs';

const privacy = readFileSync(
  new URL('../../docs/legal/PRIVACY_POLICY_DRAFT.md', import.meta.url),
  'utf8',
);
test('Cloudflare publication needs its own approved notice and explicit host disposition', () => {
  assert.throws(
    () =>
      requireCloudflareNotice(
        privacy.replace(/^<!-- deployment-host: cloudflare -->\n?/m, ''),
      ),
    /deployment-host approval/,
  );
  assert.doesNotThrow(() =>
    requireCloudflareNotice(
      privacy + '\n<!-- deployment-host: cloudflare -->\n',
    ),
  );
  assert.throws(() =>
    requireCloudflareNotice(
      privacy.replace(
        /<!-- publication-status: [^\n]+ -->/,
        '<!-- publication-status: draft -->',
      ) + '\n<!-- deployment-host: cloudflare -->\n',
    ),
  );
});
test('the legal Worker serves only static assets with stable trailing-slash routes and no invocation logs', () => {
  const config = JSON.parse(
    readFileSync(new URL('./wrangler.json', import.meta.url), 'utf8'),
  );
  assert.equal(config.assets.directory, './dist');
  assert.equal(config.assets.html_handling, 'force-trailing-slash');
  assert.equal(config.assets.not_found_handling, '404-page');
  assert.equal(config.build.command, 'node cloudflare.mjs');
  assert.deepEqual(config.observability, { enabled: false });
  assert.equal(config.main, undefined);
  assert.equal(config.hyperdrive, undefined);
});
