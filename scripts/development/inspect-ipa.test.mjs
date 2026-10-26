import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  inspectDevelopmentIpa,
  validateDevelopmentMetadata,
} from './inspect-ipa.mjs';

const now = Date.parse('2026-10-26T12:00:00Z');
const google = 'com.googleusercontent.apps.123-dev';
export function metadata() {
  const entitlements = {
    'application-identifier': 'NPDYTJS425.com.anthonyyoo.justgo.dev',
    'com.apple.developer.team-identifier': 'NPDYTJS425',
    'get-task-allow': false,
    'keychain-access-groups': ['NPDYTJS425.com.anthonyyoo.justgo.dev'],
    'com.apple.developer.icloud-container-identifiers': [
      'iCloud.com.anthonyyoo.justgo.dev',
    ],
    'com.apple.developer.icloud-services': ['CloudKit'],
    'com.apple.developer.icloud-container-environment': 'Production',
    'com.apple.developer.applesignin': ['Default'],
  };
  return {
    info: {
      CFBundleIdentifier: 'com.anthonyyoo.justgo.dev',
      CFBundleDisplayName: 'JustGO Dev',
      CFBundleShortVersionString: '0.1.0',
      CFBundleVersion: '1',
      MinimumOSVersion: '16.4',
      DTPlatformName: 'iphoneos',
      CFBundleSupportedPlatforms: ['iPhoneOS'],
      JustGoICloudContainerIdentifier: 'iCloud.com.anthonyyoo.justgo.dev',
      CFBundleURLTypes: [
        {
          CFBundleURLSchemes: [
            'justgo-dev',
            'com.anthonyyoo.justgo.dev',
            google,
          ],
        },
      ],
      UIAppFonts: [
        'Inter_400Regular.ttf',
        'Inter_500Medium.ttf',
        'Inter_600SemiBold.ttf',
      ],
      CFBundleIcons: {
        CFBundlePrimaryIcon: {
          CFBundleIconName: 'AppIcon',
          CFBundleIconFiles: ['AppIcon60x60'],
        },
      },
    },
    entitlements,
    profile: {
      TeamIdentifier: ['NPDYTJS425'],
      ProvisionedDevices: ['synthetic-phone'],
      ExpirationDate: '2027-10-26T12:00:00Z',
      Entitlements: { ...entitlements },
    },
  };
}
test('Dev metadata requires a separate app, callback, CloudKit and per-app Keychain', () => {
  const result = validateDevelopmentMetadata(metadata(), google, now);
  assert.equal(result.bundleIdentifier, 'com.anthonyyoo.justgo.dev');
  assert.equal(result.provisionedDeviceCount, 1);
  assert.equal(result.developmentClient, true);
});
test('release/shared identities, wrong capabilities and unsupported profiles fail closed', () => {
  for (const mutate of [
    (m) => {
      m.info.CFBundleIdentifier = 'com.anthonyyoo.justgo';
    },
    (m) => {
      m.info.CFBundleDisplayName = 'JustGO';
    },
    (m) => {
      m.info.CFBundleVersion = '';
    },
    (m) => {
      m.info.DTPlatformName = 'iphonesimulator';
    },
    (m) => {
      m.entitlements['application-identifier'] =
        'NPDYTJS425.com.anthonyyoo.justgo';
    },
    (m) => {
      m.profile.TeamIdentifier = ['OTHER'];
    },
    (m) => {
      m.entitlements['get-task-allow'] = true;
    },
    (m) => {
      m.profile.Entitlements['get-task-allow'] = true;
    },
    (m) => {
      m.profile.ProvisionedDevices = [];
    },
    (m) => {
      delete m.profile.ProvisionedDevices;
    },
    (m) => {
      m.profile.ProvisionsAllDevices = true;
    },
    (m) => {
      m.profile.Entitlements['beta-reports-active'] = true;
    },
    (m) => {
      m.profile.ExpirationDate = '2025-01-01';
    },
    (m) => {
      m.entitlements['keychain-access-groups'] = [
        'NPDYTJS425.com.anthonyyoo.justgo',
      ];
    },
    (m) => {
      m.entitlements['com.apple.security.application-groups'] = [
        'group.shared',
      ];
    },
    (m) => {
      m.entitlements['com.apple.developer.icloud-container-identifiers'] = [
        'iCloud.com.anthonyyoo.justgo',
      ];
    },
    (m) => {
      m.entitlements['com.apple.developer.icloud-container-environment'] =
        'Development';
    },
    (m) => {
      delete m.profile.Entitlements['com.apple.developer.applesignin'];
    },
    (m) => {
      m.profile.Entitlements[
        'com.apple.developer.icloud-container-identifiers'
      ] = 'iCloud.com.anthonyyoo.justgo.dev.other';
    },
    (m) => {
      m.info.JustGoICloudContainerIdentifier = 'iCloud.com.anthonyyoo.justgo';
    },
    (m) => {
      m.info.CFBundleURLTypes[0].CFBundleURLSchemes.push('exp+justgo');
    },
    (m) => {
      m.info.CFBundleURLTypes[0].CFBundleURLSchemes = ['justgo', google];
    },
    (m) => {
      m.info.UIAppFonts = [];
    },
    (m) => {
      delete m.info.CFBundleIcons;
    },
  ]) {
    const value = metadata();
    mutate(value);
    assert.throws(() => validateDevelopmentMetadata(value, google, now));
  }
  assert.throws(() => validateDevelopmentMetadata(metadata(), 'invalid', now));
});
test('the real archive boundary requires packaged native launchers and cleans up on failure', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'justgo-dev-inspection-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const ipa = join(root, 'input.ipa');
  await writeFile(ipa, 'synthetic');
  const m = metadata();
  for (const missing of [
    undefined,
    'EXDevMenu.bundle/Info.plist',
    'EXDevLauncher.bundle/Info.plist',
    'Inter_500Medium.ttf',
  ]) {
    const files = [
      'Info.plist',
      'embedded.mobileprovision',
      'Assets.car',
      ...m.info.UIAppFonts,
      'AppIcon60x60@2x.png',
      'EXDevMenu.bundle/Info.plist',
      'EXDevLauncher.bundle/Info.plist',
    ].filter((file) => file !== missing);
    const run = (command, args) => {
      if (command === 'unzip' && args[0] === '-Z1')
        return files.map((file) => `Payload/Dev.app/${file}`).join('\n');
      if (command === 'unzip') {
        for (const file of files) {
          const path = join(args.at(-1), 'Payload', 'Dev.app', file);
          mkdirSync(join(path, '..'), { recursive: true });
          writeFileSync(path, 'packaged fixture');
        }
        return '';
      }
      if (command === 'plutil')
        return JSON.stringify(args.at(-1) === '-' ? m.entitlements : m.info);
      if (command === 'python3') return JSON.stringify(m.profile);
      if (['codesign', 'security'].includes(command)) return '';
      throw new Error('Unexpected inspection command');
    };
    const inspect = () =>
      inspectDevelopmentIpa(ipa, google, { run, temporaryRoot: root, now });
    if (missing) await assert.rejects(inspect());
    else assert.equal((await inspect()).distribution, 'internal');
    assert.deepEqual(await readdir(root), ['input.ipa']);
  }
});
