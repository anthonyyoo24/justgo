import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { inspectSignedIosIpa } from '../release/inspect-signed-ios-ipa.mjs';
import {
  developmentIdentity,
  releaseGoogleIosClientId,
} from './configuration.mjs';

const same = (actual, expected) =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  expected.every((value) => actual.includes(value));

export function validateDevelopmentMetadata(
  { info, entitlements, profile },
  googleScheme,
  now = Date.now(),
) {
  const check = (condition, message) => {
    if (!condition) throw new Error(`Development IPA rejected: ${message}.`);
  };
  const application = `${developmentIdentity.team}.${developmentIdentity.bundle}`;
  check(
    info?.CFBundleIdentifier === developmentIdentity.bundle &&
      info.CFBundleDisplayName === 'JustGO Dev',
    'wrong app identity',
  );
  check(
    info.CFBundleShortVersionString === '0.1.0' &&
      /^\d+(?:\.\d+){0,2}$/.test(info.CFBundleVersion ?? ''),
    'missing app version',
  );
  check(
    info.MinimumOSVersion === '16.4' &&
      info.DTPlatformName === 'iphoneos' &&
      same(info.CFBundleSupportedPlatforms, ['iPhoneOS']),
    'not the supported iPhone target',
  );
  check(
    entitlements?.['application-identifier'] === application &&
      entitlements['com.apple.developer.team-identifier'] ===
        developmentIdentity.team &&
      same(profile?.TeamIdentifier, [developmentIdentity.team]) &&
      profile.Entitlements?.['application-identifier'] === application &&
      profile.Entitlements['com.apple.developer.team-identifier'] ===
        developmentIdentity.team,
    'wrong signing identity',
  );
  check(
    entitlements['get-task-allow'] === false &&
      profile.Entitlements['get-task-allow'] === false &&
      Array.isArray(profile.ProvisionedDevices) &&
      profile.ProvisionedDevices.length > 0 &&
      profile.ProvisionedDevices.every(
        (device) => typeof device === 'string' && device.length > 5,
      ) &&
      !profile.ProvisionsAllDevices &&
      !profile.Entitlements['beta-reports-active'] &&
      Date.parse(profile.ExpirationDate) > now,
    'not current ad hoc signing for registered devices',
  );
  check(
    !entitlements['keychain-access-groups'] ||
      same(entitlements['keychain-access-groups'], [application]),
    'shared Keychain access',
  );
  check(
    !entitlements['com.apple.security.application-groups'],
    'shared app group',
  );
  const capabilities = {
    'com.apple.developer.icloud-container-identifiers': [
      developmentIdentity.container,
    ],
    'com.apple.developer.icloud-services': ['CloudKit'],
    'com.apple.developer.icloud-container-environment': 'Production',
    'com.apple.developer.applesignin': ['Default'],
  };
  for (const [key, expected] of Object.entries(capabilities)) {
    check(
      Array.isArray(expected)
        ? same(entitlements[key], expected)
        : entitlements[key] === expected,
      `wrong ${key}`,
    );
    const authorization = profile.Entitlements[key];
    const allows = (required) =>
      authorization === '*' ||
      authorization === required ||
      (Array.isArray(authorization) && authorization.includes(required));
    check(
      Array.isArray(expected) ? expected.every(allows) : allows(expected),
      `profile missing ${key}`,
    );
  }
  check(
    info.JustGoICloudContainerIdentifier === developmentIdentity.container,
    'wrong native CloudKit container',
  );
  check(
    /^com\.googleusercontent\.apps\.\d+-[A-Za-z0-9_-]+$/.test(
      googleScheme ?? '',
    ) &&
      googleScheme !==
        `com.googleusercontent.apps.${releaseGoogleIosClientId.replace('.apps.googleusercontent.com', '')}`,
    'missing Google callback',
  );
  const schemes = info.CFBundleURLTypes?.flatMap(
    (type) => type.CFBundleURLSchemes ?? [],
  );
  check(
    same(schemes, [
      developmentIdentity.scheme,
      developmentIdentity.bundle,
      googleScheme,
    ]),
    'missing Dev/Google callbacks or shared release launcher',
  );
  check(
    [
      'Inter_400Regular.ttf',
      'Inter_500Medium.ttf',
      'Inter_600SemiBold.ttf',
    ].every((font) => info.UIAppFonts?.includes(font)),
    'missing Inter fonts',
  );
  check(
    info.CFBundleIcons?.CFBundlePrimaryIcon?.CFBundleIconName === 'AppIcon',
    'missing app icon',
  );
  return {
    bundleIdentifier: developmentIdentity.bundle,
    appleTeam: developmentIdentity.team,
    version: info.CFBundleShortVersionString,
    buildNumber: info.CFBundleVersion,
    distribution: 'internal',
    developmentClient: true,
    googleScheme,
    provisionedDeviceCount: profile.ProvisionedDevices.length,
  };
}

export function inspectDevelopmentIpa(path, googleScheme, options) {
  return inspectSignedIosIpa(
    path,
    async ({ info, entitlements, profile, requireFile, app, now }) => {
      const metadata = validateDevelopmentMetadata(
        { info, entitlements, profile },
        googleScheme,
        now,
      );
      for (const file of [
        'Assets.car',
        ...info.UIAppFonts,
        'EXDevMenu.bundle/Info.plist',
        'EXDevLauncher.bundle/Info.plist',
      ])
        await requireFile(join(app, file));
      const files = await readdir(app);
      if (
        !info.CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconFiles?.some(
          (name) =>
            files.some(
              (file) => file.startsWith(name) && file.endsWith('.png'),
            ),
        )
      )
        throw new Error('Development IPA is missing its declared icon image.');
      return metadata;
    },
    options,
  );
}
