import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  decodeProvisioningProfile,
  inspectBetaIpa,
  validateBetaMetadata,
} from './inspect-beta-ipa.mjs';

const now = Date.parse('2026-10-25T12:00:00Z');
function metadata() {
  const entitlements = {
    'application-identifier': 'NPDYTJS425.com.anthonyyoo.justgo',
    'com.apple.developer.team-identifier': 'NPDYTJS425',
    'get-task-allow': false,
    'com.apple.developer.icloud-container-identifiers': [
      'iCloud.com.anthonyyoo.justgo',
    ],
    'com.apple.developer.icloud-services': ['CloudKit'],
    'com.apple.developer.icloud-container-environment': 'Production',
    'com.apple.developer.applesignin': ['Default'],
  };
  return {
    info: {
      CFBundleIdentifier: 'com.anthonyyoo.justgo',
      CFBundleShortVersionString: '0.1.0',
      CFBundleVersion: '2',
      MinimumOSVersion: '16.4',
      CFBundleSupportedPlatforms: ['iPhoneOS'],
      DTPlatformName: 'iphoneos',
      JustGoICloudContainerIdentifier: 'iCloud.com.anthonyyoo.justgo',
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
      ExpirationDate: '2027-10-11T14:08:36Z',
      Entitlements: {
        ...entitlements,
        'beta-reports-active': true,
        'com.apple.developer.icloud-container-environment': [
          'Production',
          'Development',
        ],
        'com.apple.developer.icloud-services': '*',
      },
    },
  };
}

test('real profile decoder handles piped XML dates/data and emits only gate metadata', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
  <plist version="1.0"><dict>
    <key>TeamIdentifier</key><array><string>NPDYTJS425</string></array>
    <key>ExpirationDate</key><date>2027-10-11T14:08:36Z</date>
    <key>Entitlements</key><dict><key>get-task-allow</key><false/></dict>
    <key>DeveloperCertificates</key><array><data>YWJj</data></array>
    <key>Name</key><string>Excluded profile name</string>
  </dict></plist>`;
  assert.deepEqual(decodeProvisioningProfile(xml), {
    TeamIdentifier: ['NPDYTJS425'],
    ExpirationDate: '2027-10-11T14:08:36+00:00',
    Entitlements: { 'get-task-allow': false },
  });
});

test('signed store metadata preserves app identity and actual restricted capabilities', () => {
  assert.deepEqual(validateBetaMetadata(metadata(), now), {
    bundleIdentifier: 'com.anthonyyoo.justgo',
    appleTeam: 'NPDYTJS425',
    version: '0.1.0',
    buildNumber: '2',
    minimumIos: '16.4',
    distribution: 'store',
  });
});

test('wrong app/team, development/adhoc/enterprise, expired profiles and missing capabilities fail closed', () => {
  const mutations = [
    (m) => {
      m.info.CFBundleIdentifier = 'dev.justgo.foundation';
    },
    (m) => {
      m.info.CFBundleVersion = '';
    },
    (m) => {
      m.info.CFBundleShortVersionString = '0.2.0';
    },
    (m) => {
      m.info.MinimumOSVersion = '15.0';
    },
    (m) => {
      m.info.CFBundleSupportedPlatforms = ['iPhoneSimulator'];
    },
    (m) => {
      m.info.DTPlatformName = 'iphonesimulator';
    },
    (m) => {
      m.entitlements['com.apple.developer.team-identifier'] = 'OTHER';
    },
    (m) => {
      m.profile.TeamIdentifier = ['OTHER'];
    },
    (m) => {
      m.profile.Entitlements['application-identifier'] = 'NPDYTJS425.*';
    },
    (m) => {
      m.entitlements['get-task-allow'] = true;
    },
    (m) => {
      delete m.entitlements['get-task-allow'];
    },
    (m) => {
      m.profile.Entitlements['get-task-allow'] = true;
    },
    (m) => {
      m.profile.ProvisionedDevices = [];
    },
    (m) => {
      m.profile.ProvisionsAllDevices = true;
    },
    (m) => {
      delete m.profile.Entitlements['beta-reports-active'];
    },
    (m) => {
      m.profile.ExpirationDate = '2026-10-25T12:00:00Z';
    },
    (m) => {
      m.profile.ExpirationDate = 'invalid';
    },
    (m) => {
      m.entitlements['com.apple.developer.icloud-services'] = [
        'CloudKit',
        'CloudDocuments',
      ];
    },
    (m) => {
      m.entitlements['com.apple.developer.icloud-container-environment'] =
        'Development';
    },
    (m) => {
      m.entitlements['com.apple.developer.icloud-container-identifiers'] = [
        'iCloud.other',
      ];
    },
    (m) => {
      m.profile.Entitlements['com.apple.developer.icloud-services'] = [
        'CloudDocuments',
      ];
    },
    (m) => {
      m.profile.Entitlements[
        'com.apple.developer.icloud-container-environment'
      ] = ['Development'];
    },
    (m) => {
      delete m.entitlements['com.apple.developer.applesignin'];
    },
    (m) => {
      m.info.JustGoICloudContainerIdentifier = 'iCloud.other';
    },
    (m) => {
      m.entitlements['keychain-access-groups'] = ['NPDYTJS425.*'];
    },
    (m) => {
      m.info.UIAppFonts.pop();
    },
    (m) => {
      delete m.info.CFBundleIcons;
    },
  ];
  for (const mutate of mutations) {
    const value = metadata();
    mutate(value);
    assert.throws(() => validateBetaMetadata(value, now), Error);
  }
});

async function fixture(
  t,
  { missing, signatureFails = false, unsafe = false } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'justgo-ipa-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = join(root, 'input.ipa');
  await writeFile(archive, 'fixture archive');
  const calls = [];
  const data = metadata();
  const files = [
    'Info.plist',
    'embedded.mobileprovision',
    'main.jsbundle',
    'Assets.car',
    ...data.info.UIAppFonts,
    'AppIcon60x60@2x.png',
  ];
  const run = (command, args) => {
    calls.push({ command, args });
    if (command === 'unzip' && args[0] === '-Z1')
      return unsafe
        ? '../escape\n'
        : files.map((file) => `Payload/JustGO.app/${file}`).join('\n');
    if (command === 'unzip') {
      // The fixture's synchronous extraction is awaited by the wrapper below.
      return '';
    }
    if (command === 'codesign' && args[0] === '--verify') {
      if (signatureFails) throw new Error('Signature rejected');
      assert.deepEqual(args.slice(0, 3), ['--verify', '--deep', '--strict']);
      return '';
    }
    if (command === 'codesign') return 'signed XML';
    if (command === 'security') return 'profile XML';
    if (command === 'python3') return JSON.stringify(data.profile);
    if (command === 'plutil')
      return JSON.stringify(
        args.at(-1) === '-' ? data.entitlements : data.info,
      );
    throw new Error(`Unexpected fixture command: ${command}`);
  };
  return {
    root,
    archive,
    calls,
    files: files.filter((file) => file !== missing),
    run,
  };
}

// Extraction happens synchronously in production, so fixture extraction uses the
// same filesystem boundary without replacing signature/profile validation logic.
import { mkdirSync, writeFileSync } from 'node:fs';
function extractingRun(fixture) {
  return (command, args, options) => {
    if (command === 'unzip' && args[0] === '-q') {
      const app = join(args.at(-1), 'Payload', 'JustGO.app');
      mkdirSync(app, { recursive: true });
      for (const file of fixture.files)
        writeFileSync(join(app, file), 'packaged fixture');
    }
    return fixture.run(command, args, options);
  };
}

test('inspection checks actual files/signatures and removes its extraction after success', async (t) => {
  const value = await fixture(t);
  const result = await inspectBetaIpa(value.archive, {
    run: extractingRun(value),
    temporaryRoot: value.root,
    now,
  });
  assert.equal(result.distribution, 'store');
  assert.ok(value.calls.some(({ command }) => command === 'security'));
  assert.deepEqual(await readdir(value.root), ['input.ipa']);
});

test('missing JS/fonts/icon assets and signature failure all reject and clean up', async (t) => {
  for (const options of [
    { missing: 'main.jsbundle' },
    { missing: 'Inter_500Medium.ttf' },
    { missing: 'Assets.car' },
    { missing: 'AppIcon60x60@2x.png' },
    { signatureFails: true },
    { unsafe: true },
  ]) {
    const value = await fixture(t, options);
    await assert.rejects(
      inspectBetaIpa(value.archive, {
        run: extractingRun(value),
        temporaryRoot: value.root,
        now,
      }),
    );
    assert.deepEqual(await readdir(value.root), ['input.ipa']);
  }
});
