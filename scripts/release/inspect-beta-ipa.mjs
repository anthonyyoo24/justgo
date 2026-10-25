import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

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

function execute(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    });
  } catch {
    // Command errors may embed provisioning contents; keep them out of CI logs.
    throw new Error(`Signed beta inspection failed while running ${command}.`);
  }
}

const profileDecoder = `import datetime,json,plistlib,sys
p=plistlib.loads(sys.stdin.buffer.read())
keys=['TeamIdentifier','Entitlements','ProvisionedDevices','ProvisionsAllDevices','ExpirationDate']
print(json.dumps({k:p[k] for k in keys if k in p},default=lambda v:v.replace(tzinfo=datetime.timezone.utc).isoformat() if isinstance(v,datetime.datetime) else None))`;

/** Decode only the public profile fields needed by the signing gate. */
export function decodeProvisioningProfile(xml, run = execute) {
  return JSON.parse(run('python3', ['-c', profileDecoder], { input: xml }));
}

/** Inspect the actual archive; each extraction is owned and removed on all exits. */
export async function inspectBetaIpa(
  ipaPath,
  { run = execute, temporaryRoot = tmpdir(), now = Date.now() } = {},
) {
  const ipa = resolve(ipaPath);
  const directory = await realpath(
    await mkdtemp(join(temporaryRoot, 'justgo-beta-ipa-')),
  );
  try {
    const entries = run('unzip', ['-Z1', ipa]).trim().split('\n');
    if (
      entries.some(
        (entry) =>
          entry.startsWith('/') ||
          entry.includes('\\') ||
          entry.split('/').includes('..'),
      )
    )
      throw new Error('Beta archive contains an unsafe extraction path.');
    run('unzip', ['-q', ipa, '-d', directory]);
    const applications = (
      await readdir(join(directory, 'Payload'), { withFileTypes: true })
    ).filter((entry) => entry.isDirectory() && entry.name.endsWith('.app'));
    if (applications.length !== 1)
      throw new Error('Beta archive must contain exactly one device app.');
    const app = join(directory, 'Payload', applications[0].name);
    const requireFile = async (path) => {
      const actual = await realpath(path);
      const within = relative(directory, actual);
      if (
        within.startsWith(`..${sep}`) ||
        within === '..' ||
        resolve(actual) === resolve(directory)
      )
        throw new Error('Beta file escapes the inspected archive.');
      const details = await stat(actual);
      if (!details.isFile() || details.size === 0)
        throw new Error(`Missing or empty beta file: ${basename(path)}.`);
    };
    const infoPath = join(app, 'Info.plist');
    const profilePath = join(app, 'embedded.mobileprovision');
    await requireFile(infoPath);
    await requireFile(profilePath);
    run('codesign', ['--verify', '--deep', '--strict', app]);
    const info = JSON.parse(
      run('plutil', ['-convert', 'json', '-o', '-', infoPath]),
    );
    const entitlements = JSON.parse(
      run('plutil', ['-convert', 'json', '-o', '-', '-'], {
        input: run('codesign', [
          '--display',
          '--entitlements',
          '-',
          '--xml',
          app,
        ]),
      }),
    );
    const profile = decodeProvisioningProfile(
      run('security', ['cms', '-D', '-i', profilePath]),
      run,
    );
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
          files.some((file) => file.startsWith(name) && file.endsWith('.png')),
      )
    )
      throw new Error('The signed app is missing its declared icon image.');
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  if (process.argv.length !== 3)
    throw new Error('Usage: inspect-beta-ipa.mjs <signed IPA path>');
  console.info(JSON.stringify(await inspectBetaIpa(process.argv[2])));
}
