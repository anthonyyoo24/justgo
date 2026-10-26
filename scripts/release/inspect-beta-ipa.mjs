import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectSignedIosIpa } from './inspect-signed-ios-ipa.mjs';
export { decodeProvisioningProfile } from './inspect-signed-ios-ipa.mjs';

const bundle = 'com.anthonyyoo.justgo';
const team = 'NPDYTJS425';
const applicationIdentifier = `${team}.${bundle}`;
const container = `iCloud.${bundle}`;
const fonts = [
  'Inter_400Regular.ttf',
  'Inter_500Medium.ttf',
  'Inter_600SemiBold.ttf',
];
const sameMembers = (actual, expected) =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  expected.every((value) => actual.includes(value));

/** Validate public signed metadata without printing provisioning contents. */
export function validateBetaMetadata(
  { info, entitlements, profile },
  now = Date.now(),
) {
  const require = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  require(info?.CFBundleIdentifier ===
    bundle, 'Unexpected beta bundle identifier.');
  require(info.CFBundleShortVersionString === '0.1.0' &&
    /^\d+(?:\.\d+){0,2}$/.test(
      info.CFBundleVersion ?? '',
    ), 'Missing or unexpected beta app/build version.');
  require(info.MinimumOSVersion === '16.4' &&
    sameMembers(info.CFBundleSupportedPlatforms, ['iPhoneOS']) &&
    info.DTPlatformName ===
      'iphoneos', 'Beta must target real iPhones with the reviewed iOS minimum.');
  require(entitlements?.['application-identifier'] === applicationIdentifier &&
    entitlements['com.apple.developer.team-identifier'] === team &&
    sameMembers(profile?.TeamIdentifier, [team]) &&
    profile.Entitlements?.['application-identifier'] ===
      applicationIdentifier &&
    profile.Entitlements?.['com.apple.developer.team-identifier'] ===
      team, 'Signed app and provisioning profile must preserve the existing app/team.');
  require(entitlements['get-task-allow'] === false &&
    profile.Entitlements['get-task-allow'] === false &&
    profile.ProvisionedDevices === undefined &&
    (profile.ProvisionsAllDevices === undefined ||
      profile.ProvisionsAllDevices === false) &&
    profile.Entitlements['beta-reports-active'] === true &&
    Number.isFinite(Date.parse(profile.ExpirationDate)) &&
    Date.parse(profile.ExpirationDate) >
      now, 'Beta needs a current App Store profile without development or device-list signing.');
  require(sameMembers(
    entitlements['com.apple.developer.icloud-container-identifiers'],
    [container],
  ) &&
    sameMembers(entitlements['com.apple.developer.icloud-services'], [
      'CloudKit',
    ]) &&
    entitlements['com.apple.developer.icloud-container-environment'] ===
      'Production' &&
    sameMembers(entitlements['com.apple.developer.applesignin'], [
      'Default',
    ]), 'Beta must preserve Production CloudKit and Apple sign-in entitlements.');
  const allows = (value, required) =>
    value === '*' ||
    value === required ||
    (Array.isArray(value) && value.includes(required));
  require(allows(
    profile.Entitlements['com.apple.developer.icloud-container-identifiers'],
    container,
  ) &&
    allows(
      profile.Entitlements['com.apple.developer.icloud-services'],
      'CloudKit',
    ) &&
    allows(
      profile.Entitlements['com.apple.developer.icloud-container-environment'],
      'Production',
    ) &&
    allows(
      profile.Entitlements['com.apple.developer.applesignin'],
      'Default',
    ), 'Provisioning profile does not authorize the required app capabilities.');
  require(info.JustGoICloudContainerIdentifier ===
    container, 'App configuration must preserve the signed CloudKit container.');
  require(!entitlements['keychain-access-groups'] ||
    sameMembers(entitlements['keychain-access-groups'], [
      applicationIdentifier,
    ]), 'Beta must preserve per-app Keychain access.');
  require(fonts.every((font) =>
    info.UIAppFonts?.includes(font),
  ), 'The three Inter fonts must be registered in the signed app.');
  require(info.CFBundleIcons?.CFBundlePrimaryIcon?.CFBundleIconName ===
    'AppIcon' &&
    Array.isArray(info.CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconFiles) &&
    info.CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconFiles.length >
      0, 'The signed app must declare its AppIcon.');
  return {
    bundleIdentifier: bundle,
    appleTeam: team,
    version: info.CFBundleShortVersionString,
    buildNumber: info.CFBundleVersion,
    minimumIos: info.MinimumOSVersion,
    distribution: 'store',
  };
}

/** Apply the strict store gate to the actual signed archive. */
export async function inspectBetaIpa(ipaPath, options = {}) {
  return inspectSignedIosIpa(
    ipaPath,
    async ({ info, entitlements, profile, app, requireFile, now }) => {
      const result = validateBetaMetadata({ info, entitlements, profile }, now);
      await requireFile(join(app, 'main.jsbundle'));
      await requireFile(join(app, 'Assets.car'));
      for (const font of fonts) await requireFile(join(app, font));
      const icons = info.CFBundleIcons.CFBundlePrimaryIcon.CFBundleIconFiles;
      const files = await readdir(app);
      if (
        !icons.some(
          (name) =>
            typeof name === 'string' &&
            files.some(
              (file) => file.startsWith(name) && file.endsWith('.png'),
            ),
        )
      )
        throw new Error('The signed app is missing its declared icon image.');
      return result;
    },
    options,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  if (process.argv.length !== 3)
    throw new Error('Usage: inspect-beta-ipa.mjs <signed IPA path>');
  console.info(JSON.stringify(await inspectBetaIpa(process.argv[2])));
}
