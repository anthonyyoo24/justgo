import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { mobileRoot } from './configuration.mjs';

test('the installed Expo plugin pipeline generates isolated Dev callbacks and CloudKit permissions', () => {
  const require = createRequire(
    new URL('../../apps/mobile/package.json', import.meta.url),
  );
  const eas = JSON.parse(
    readFileSync(
      new URL('../../apps/mobile/eas.json', import.meta.url),
      'utf8',
    ),
  );
  const googleScheme = 'com.googleusercontent.apps.123-dev';
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('expo/bin/cli'),
      'config',
      '--type',
      'introspect',
      '--json',
    ],
    {
      cwd: mobileRoot,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      env: {
        ...process.env,
        ...eas.build.development.env,
        EXPO_NO_DOTENV: '1',
        EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME: googleScheme,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(config.name, 'JustGO Dev');
  const ios = config._internal.modResults.ios;
  assert.equal(ios.podfileProperties.EXPO_USE_PRECOMPILED_MODULES, 'false');
  assert.equal(ios.podfileProperties['ios.useFrameworks'], 'static');
  assert.deepEqual(
    ios.infoPlist.CFBundleURLTypes.flatMap(
      (type) => type.CFBundleURLSchemes,
    ).sort(),
    ['justgo-dev', 'com.anthonyyoo.justgo.dev', googleScheme].sort(),
  );
  assert.deepEqual(ios.entitlements, {
    'com.apple.developer.applesignin': ['Default'],
    'com.apple.developer.icloud-container-identifiers': [
      'iCloud.com.anthonyyoo.justgo.dev',
    ],
    'com.apple.developer.icloud-services': ['CloudKit'],
    'com.apple.developer.icloud-container-environment': 'Production',
  });
});
