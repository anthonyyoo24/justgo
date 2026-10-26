import { execFileSync } from 'node:child_process';
import { mkdtemp, readdir, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve, sep } from 'node:path';

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
    throw new Error(`Signed iOS inspection failed while running ${command}.`);
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
export async function inspectSignedIosIpa(
  ipaPath,
  inspect,
  { run = execute, temporaryRoot = tmpdir(), now = Date.now() } = {},
) {
  const ipa = resolve(ipaPath);
  const directory = await realpath(
    await mkdtemp(join(temporaryRoot, 'justgo-ios-ipa-')),
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
      throw new Error('iOS archive contains an unsafe extraction path.');
    run('unzip', ['-q', ipa, '-d', directory]);
    const applications = (
      await readdir(join(directory, 'Payload'), { withFileTypes: true })
    ).filter((entry) => entry.isDirectory() && entry.name.endsWith('.app'));
    if (applications.length !== 1)
      throw new Error('iOS archive must contain exactly one device app.');
    const app = join(directory, 'Payload', applications[0].name);
    const requireFile = async (path) => {
      const actual = await realpath(path);
      const within = relative(directory, actual);
      if (
        within.startsWith(`..${sep}`) ||
        within === '..' ||
        resolve(actual) === resolve(directory)
      )
        throw new Error('iOS file escapes the inspected archive.');
      const details = await stat(actual);
      if (!details.isFile() || details.size === 0)
        throw new Error(`Missing or empty iOS file: ${basename(path)}.`);
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
    return await inspect({
      info,
      entitlements,
      profile,
      app,
      requireFile,
      now,
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
