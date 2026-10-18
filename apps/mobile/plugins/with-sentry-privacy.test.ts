import type { ExportedConfig, XcodeProject } from 'expo/config-plugins';
import type { ExpoConfig } from 'expo/config';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const withSentryPrivacy = require('./with-sentry-privacy.cjs') as (
  config: ExpoConfig,
  options: Record<string, unknown>,
) => ExportedConfig;
const withSentry = require('@sentry/react-native/expo').withSentry as (
  config: ExpoConfig,
  options: Record<string, unknown>,
) => ExportedConfig;
const publicDsn = `https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/4512279181459456`;
const enabled = { enabled: true, dsn: publicDsn, environment: 'staging' };
const disabled = { enabled: false, dsn: '', environment: undefined };
// Supplementary compiler evidence where Swift is installed; ordinary generation
// assertions below still enforce the reviewed nonoptional exception contract.
const swiftTest =
  spawnSync('swift', ['--version'], { timeout: 5_000 }).status === 0
    ? it
    : it.skip;
const base: ExpoConfig = {
  name: 'JustGO',
  slug: 'justgo',
  platforms: ['ios', 'web'],
};
const modRequest = {
  projectRoot: '/fixture',
  platformProjectRoot: '/fixture/ios',
  projectName: 'JustGO',
  platform: 'ios' as const,
  modName: 'appDelegate',
  introspect: false,
};
// The multiline installed Expo 57 launch signature, including linking overloads.
const appDelegate = `internal import Expo
import React
import ReactAppDependencyProvider

@main
class AppDelegate: ExpoAppDelegate {
  public override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = ExpoReactNativeFactory(delegate: delegate)
    factory.startReactNative(withModuleName: "main", launchOptions: launchOptions)
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  public override func application(
    _ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool { return true }
}
`;
async function evaluate(
  options: Record<string, unknown> = enabled,
  contents = appDelegate,
  language: 'swift' | 'objcpp' = 'swift',
) {
  const config = withSentryPrivacy({ ...base }, options);
  const mod = config.mods?.ios?.appDelegate;
  if (!mod) throw new Error('appDelegate mod was not registered');
  const result = await mod({
    ...config,
    modRawConfig: config,
    modResults: { path: '/fixture/AppDelegate.swift', contents, language },
    modRequest,
  });
  return result.modResults.contents;
}
function project() {
  return {
    hash: {
      project: {
        objects: {
          PBXShellScriptBuildPhase: {
            bundle: {
              isa: 'PBXShellScriptBuildPhase',
              shellScript: JSON.stringify(
                '/bin/sh "node_modules/@sentry/react-native/scripts/sentry-xcode.sh" "react-native-xcode.sh"\n',
              ),
            },
            symbols: {
              isa: 'PBXShellScriptBuildPhase',
              shellScript: JSON.stringify(
                '/bin/sh "node_modules/@sentry/react-native/scripts/sentry-xcode-debug-files.sh"\n',
              ),
            },
            ordinary: {
              isa: 'PBXShellScriptBuildPhase',
              shellScript: JSON.stringify('echo ordinary\n'),
            },
          },
        },
      },
    },
  };
}
async function buildScripts(
  options: Record<string, unknown> = enabled,
  input = project(),
) {
  const config = withSentryPrivacy({ ...base }, options);
  const mod = config.mods?.ios?.xcodeproj;
  if (!mod) throw new Error('xcodeproj mod was not registered');
  await mod({
    ...config,
    modRawConfig: config,
    modResults: input as unknown as XcodeProject,
    modRequest: { ...modRequest, modName: 'xcodeproj' },
  });
  return input;
}
function prefix(shellScript: string) {
  const code = JSON.parse(shellScript) as string;
  const marker = '# END JustGO Sentry uploads\n';
  return code.slice(0, code.indexOf(marker) + marker.length);
}

describe('native Sentry privacy config plugin', () => {
  it('initializes before React Native with the supported SDK and explicit public props', async () => {
    expect(require('@sentry/react-native/package.json').version).toBe('7.11.0');
    const contents = await evaluate();
    for (const framework of ['Sentry', 'Foundation', 'UIKit'])
      expect(contents).toContain(`import ${framework}`);
    expect(contents).toContain('static let isEnabled = true');
    expect(contents).toContain(`options.dsn = "${publicDsn}"`);
    expect(contents).toContain('options.environment = "staging"');
    expect(contents).toContain('guard isEnabled else { return }');
    expect(contents.indexOf('    JustGODiagnostics.start()')).toBeLessThan(
      contents.indexOf('let delegate = ReactNativeDelegate()'),
    );
    expect(contents.match(/^ {4}JustGODiagnostics\.start\(\)$/gm)).toHaveLength(
      1,
    );
    expect(contents).not.toContain('RNSentrySDK');
    expect(contents).not.toContain('sentry.options');
    expect(await evaluate(enabled, contents)).toBe(contents);
  });
  it('combines with the official SDK 7 plugin and reconciles enabled → off → enabled incrementally', async () => {
    let contents = appDelegate;
    let first = '';
    for (const [index, options] of [enabled, disabled, enabled].entries()) {
      let config = withSentry(
        { ...base },
        {
          organization: 'anthony-corp',
          project: 'justgo-mobile',
          url: 'https://sentry.io/',
        },
      );
      config = withSentryPrivacy(config, options);
      const mod = config.mods?.ios?.appDelegate;
      if (!mod) throw new Error('appDelegate mod was not registered');
      const result = await mod({
        ...config,
        modRawConfig: config,
        modResults: {
          path: '/fixture/AppDelegate.swift',
          contents,
          language: 'swift',
        },
        modRequest,
      });
      contents = result.modResults.contents;
      expect(
        contents.match(/^ {4}JustGODiagnostics\.start\(\)$/gm),
      ).toHaveLength(1);
      expect(contents.match(/SentrySDK\.start\s*\{/g)).toHaveLength(1);
      if (index === 0) first = contents;
      if (!options.enabled) {
        expect(contents).toContain('static let isEnabled = false');
        expect(contents).toContain('options.dsn = ""');
        expect(contents).not.toContain(publicDsn);
      }
    }
    expect(contents).toBe(first);
  });
  it('rejects unreviewed SDK versions before producing native code', () => {
    try {
      jest.isolateModules(() => {
        jest.doMock('@sentry/react-native/package.json', () => ({
          version: '8.31.0',
        }));
        const plugin =
          require('./with-sentry-privacy.cjs') as typeof withSentryPrivacy;
        expect(() => plugin(base, enabled)).toThrow('reviewed SDK 7.11.0');
      });
    } finally {
      jest.dontMock('@sentry/react-native/package.json');
    }
  });
  it.each<[string, 'swift' | 'objcpp', string]>([
    [appDelegate, 'objcpp', 'reviewed Swift'],
    [
      appDelegate.replace(
        'didFinishLaunchingWithOptions launchOptions:',
        'other launchOptions:',
      ),
      'swift',
      'reviewed Expo 57',
    ],
    [appDelegate + appDelegate, 'swift', 'reviewed Expo 57'],
    [appDelegate + '\nSentrySDK.start { _ in }', 'swift', 'unowned'],
    [
      appDelegate + '\n// BEGIN JustGO native diagnostics privacy',
      'swift',
      'incomplete',
    ],
  ])(
    'fails closed for unsupported native source',
    async (contents, language, error) => {
      await expect(evaluate(enabled, contents, language)).rejects.toThrow(
        error,
      );
    },
  );
  it('refuses other platforms and unsafe public Swift configuration', () => {
    expect(() =>
      withSentryPrivacy({ name: 'JustGO', slug: 'justgo' }, enabled),
    ).toThrow('iOS only');
    expect(() =>
      withSentryPrivacy({ ...base, platforms: ['ios', 'android'] }, enabled),
    ).toThrow('iOS only');
    for (const options of [
      {},
      { ...enabled, enabled: 'true' },
      { ...enabled, dsn: `${publicDsn}\\(private)` },
      { ...enabled, environment: 'private' },
    ])
      expect(() => withSentryPrivacy(base, options)).toThrow(
        'validated public configuration',
      );
  });
  it('rebuilds native event/stack objects and excludes freeform source/user context', async () => {
    const contents = await evaluate();
    for (const text of [
      'let clean = Event(level: event.level)',
      'Exception(value: "Native application failure", type: type)',
      'let frame = Frame()',
      'SentryStacktrace(frames: frames, registers: [:])',
      'image.debugID = debugID',
      'frame.instructionAddress = address(original.instructionAddress)',
      'image.codeFile = "image-\\(index)"',
      'user.ipAddress = "0.0.0.0"',
      '"version": "8.58.0"',
      'ExceptionsManager.reportException',
      '$0.type.contains("Unhandled JS Exception")',
      '$0.value.contains("ExceptionsManager.reportException")',
      'allowedTypes.contains(original.type) ? original.type : "NativeError"',
    ])
      expect(contents).toContain(text);
    for (const field of [
      'user',
      'extra',
      'tags',
      'request',
      'context',
      'message',
      'sdk',
      'error',
      'modules',
      'fingerprint',
      'breadcrumbs',
      'transaction',
    ])
      expect(contents).not.toContain(`= event.${field}`);
    for (const field of [
      'value',
      'module',
      'function',
      'fileName',
      'package',
      'contextLine',
      'vars',
      'preContext',
      'postContext',
      'registers',
      'name',
    ])
      expect(contents).not.toMatch(new RegExp(`= original\\.${field}\\b`));
  });
  swiftTest(
    'compiles and runs generated exception handling against Cocoa 8.58 String properties (requires Swift)',
    async () => {
      const contents = await evaluate();
      const duplicateFilter = contents.match(
        / {4}if exceptions\.contains\(where: \{[\s\S]*?\}\) \{ return nil \}/,
      )?.[0];
      const exceptionMapping = contents.match(
        / {4}clean\.exceptions = exceptions\.prefix\(10\)\.map \{[\s\S]*?^ {4}\}/m,
      )?.[0];
      if (!duplicateFilter || !exceptionMapping)
        throw new Error('Generated native exception handling was not found');
      const source = readFileSync(
        join(__dirname, 'with-sentry-privacy.fixture.swift'),
        'utf8',
      )
        .replace('// GENERATED_DUPLICATE_FILTER', duplicateFilter)
        .replace('// GENERATED_EXCEPTION_MAPPING', exceptionMapping);
      const result = spawnSync('swift', ['-'], {
        input: source,
        encoding: 'utf8',
        timeout: 20_000,
      });
      expect(result.error).toBeUndefined();
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toBe('Native exception contract passed\n');
    },
    30_000,
  );
  it('disables supported non-error sources and limits attachments without newer APIs', async () => {
    const contents = await evaluate();
    for (const flag of [
      'sendDefaultPii',
      'enableAutoBreadcrumbTracking',
      'enableNetworkBreadcrumbs',
      'enableSwizzling',
      'enableNetworkTracking',
      'enableCaptureFailedRequests',
      'enableAutoPerformanceTracing',
      'enableAutoSessionTracking',
      'enableWatchdogTerminationTracking',
      'enableAppHangTracking',
      'enableAppHangTrackingV2',
      'enableMetricKit',
      'enableMetricKitRawPayload',
      'attachScreenshot',
      'attachViewHierarchy',
      'sendClientReports',
      'enableSpotlight',
    ])
      expect(contents).toContain(`options.${flag} = false`);
    for (const text of [
      'options.integrations = ["SentryCrashIntegration"]',
      'options.experimental.enableLogs = false',
      'options.beforeSendLog = { _ in nil }',
      'options.maxAttachmentSize = 0',
      'SentrySDK.configureScope { scope in scope.clearAttachments() }',
      'session.httpShouldSetCookies = false',
      'session.httpCookieStorage = nil',
      'options.sessionReplay.sessionSampleRate = 0',
      'options.sessionReplay.onErrorSampleRate = 0',
      'event.type == nil || event.type == "default"',
      'event.level == .error || event.level == .fatal',
      '["development", "staging", "production"].contains(environment) else { return nil }',
    ])
      expect(contents).toContain(text);
    for (const absent of [
      'beforeSendWithHint',
      'enableMemoryIntrospection',
      'enableMetrics',
      'attachAllThreads',
    ])
      expect(contents).not.toContain(`options.${absent}`);
  });
  it('keeps cached numeric version/build metadata ahead of the upgraded binary fallback', async () => {
    const contents = await evaluate();
    for (const text of [
      'let cached = cachedRelease(event.releaseName)',
      'let version = cached?.version\n      ?? versionNumber(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString"))',
      'let build = versionNumber(event.dist) ?? cached?.build\n      ?? versionNumber(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion"))',
      'clean.releaseName = "justgo-mobile@\\(version)"',
      'clean.dist = build',
      'parts[0] == "justgo-mobile" || String(parts[0]) == Bundle.main.bundleIdentifier',
      'let version = versionNumber(String(metadata[0])) else { return nil }',
      '"^[0-9]+(?:\\\\.[0-9]+){0,3}$"',
    ])
      expect(contents).toContain(text);
    expect(contents).not.toContain('clean.releaseName = event.releaseName');
    expect(contents).not.toContain('clean.dist = event.dist');
    expect(contents).toContain(
      'ProcessInfo.processInfo.operatingSystemVersion',
    );
    expect(contents).not.toContain('UIDevice.current');
  });
  it('updates both instrumented upload phases incrementally without embedding an upload token', async () => {
    const input = await buildScripts(disabled);
    const phases = input.hash.project.objects.PBXShellScriptBuildPhase;
    const off = phases.bundle.shellScript;
    expect(prefix(off)).toContain('[ "false" != "true" ]');
    await buildScripts(enabled, input);
    const on = phases.bundle.shellScript;
    expect(prefix(on)).toContain('[ "true" != "true" ]');
    expect(phases.symbols.shellScript).toContain('JustGO Sentry uploads');
    expect(JSON.parse(phases.ordinary.shellScript)).toBe('echo ordinary\n');
    await buildScripts(enabled, input);
    expect(phases.bundle.shellScript).toBe(on);
    await buildScripts(disabled, input);
    expect(phases.bundle.shellScript).toBe(off);
    expect(on).not.toContain('fixture-upload-token');
  });
  it.each([
    [false, 'Release', undefined, 0, 'true'],
    [true, 'Debug', undefined, 0, 'true'],
    [true, 'Release', undefined, 1, ''],
    [true, 'Release', 'fixture-upload-token', 0, 'unset'],
  ] as const)(
    'enforces upload gating for enabled=%s configuration=%s',
    async (isEnabled, configuration, token, status, output) => {
      const input = await buildScripts(isEnabled ? enabled : disabled);
      const code = prefix(
        input.hash.project.objects.PBXShellScriptBuildPhase.bundle.shellScript,
      );
      const result = spawnSync(
        '/bin/sh',
        ['-c', code + '\nprintf "%s" "${SENTRY_DISABLE_AUTO_UPLOAD-unset}"'],
        {
          encoding: 'utf8',
          env: {
            NODE_ENV: 'test',
            CONFIGURATION: configuration,
            SENTRY_DISABLE_AUTO_UPLOAD: 'true',
            SENTRY_ALLOW_FAILURE: 'true',
            ...(token ? { SENTRY_AUTH_TOKEN: token } : {}),
          },
        },
      );
      expect(result.status).toBe(status);
      if (status === 0) expect(result.stdout).toBe(output);
      else expect(result.stdout).toContain('require SENTRY_AUTH_TOKEN');
      expect(result.stderr).toBe('');
    },
  );
  it('fails closed when an SDK-instrumented upload phase is absent', async () => {
    const input = project();
    input.hash.project.objects.PBXShellScriptBuildPhase.symbols.shellScript =
      JSON.stringify('echo uninstrumented');
    await expect(buildScripts(enabled, input)).rejects.toThrow(
      'instrumented bundle and debug-symbol',
    );
  });
});
