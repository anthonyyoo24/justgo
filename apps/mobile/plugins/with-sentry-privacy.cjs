// Expo loads local config plugins synchronously as CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { withBaseMod } = require('expo/config-plugins');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version: sdkVersion } = require('@sentry/react-native/package.json');

const begin = '// BEGIN JustGO native diagnostics privacy';
const end = '// END JustGO native diagnostics privacy';
const legacyNativeCall =
  'RNSentrySDK.start(configureOptions: JustGODiagnostics.configure)';
const legacyGuardedCall = `if JustGODiagnostics.isEnabled { ${legacyNativeCall} }`;
const launchCall = 'JustGODiagnostics.start()';

// Reviewed against Expo's supported @sentry/react-native 8.28.0 / Cocoa 9.29.0.
// Native crashes bypass JavaScript beforeSend. Keep the native callback installed
// for the whole process: JavaScript must use autoInitializeNativeSdk: false.
function swift(configuration) {
  return String.raw`
${begin}
private enum JustGODiagnostics {
  // These public build values are replaced on every prebuild, including off.
  static let isEnabled = ${configuration.enabled}

  static func start() {
    guard isEnabled else { return }
    SentrySDK.start { options in
      options.enabled = isEnabled
      options.dsn = ${JSON.stringify(configuration.dsn)}
      options.environment = ${JSON.stringify(configuration.environment)}
      configure(options)
    }
  }

  static func configure(_ options: Options) {
    let reportingEnabled = isEnabled && options.enabled
    if !reportingEnabled {
      options.enabled = false
      options.dsn = nil
      options.enableCrashHandler = false
    }
    options.debug = false
    // Cocoa 9 installs integrations internally. Disable their automatic sources
    // and independently reject non-error telemetry through the send callbacks.
    options.enableMemoryIntrospection = false
    options.attachAllThreads = false
    options.maxFeatureFlags = 0
    options.sendDefaultPii = false
    options.maxBreadcrumbs = 0
    options.beforeBreadcrumb = { _ in nil }
    options.enableAutoBreadcrumbTracking = false
    options.enableNetworkBreadcrumbs = false
    options.enableSwizzling = false
    options.enableNetworkTracking = false
    options.enableCaptureFailedRequests = false
    options.enableAutoPerformanceTracing = false
    options.enableUIViewControllerTracing = false
    options.enableUserInteractionTracing = false
    options.enableFileIOTracing = false
    options.enableCoreDataTracing = false
    options.enablePersistingTracesWhenCrashing = false
    options.tracesSampleRate = nil
    options.tracesSampler = nil
    options.tracePropagationTargets = []
    options.enableAutoSessionTracking = false
    options.enableWatchdogTerminationTracking = false
    options.enableAppHangTracking = false
    options.enableReportNonFullyBlockingAppHangs = false
    options.enableMetricKit = false
    options.enableMetricKitRawPayload = false
    options.attachScreenshot = false
    options.attachViewHierarchy = false
    options.reportAccessibilityIdentifier = false
    options.maxAttachmentSize = 0
    options.enableLogs = false
    options.enableDataSwizzling = false
    options.enableFileManagerSwizzling = false
    options.enableMetrics = false
    options.beforeSendLog = { _ in nil }
    options.beforeSendMetric = { _ in nil }
    options.beforeSendSpan = { _ in nil }
    options.sendClientReports = false
    options.enableSpotlight = false
    options.sessionReplay.sessionSampleRate = 0
    options.sessionReplay.onErrorSampleRate = 0
    options.configureProfiling = { profiling in
      profiling.sessionSampleRate = 0
      profiling.profileAppStarts = false
    }
    options.initialScope = { _ in Scope(maxBreadcrumbs: 0) }
    let session = URLSessionConfiguration.ephemeral
    session.httpShouldSetCookies = false
    session.httpCookieStorage = nil
    session.urlCache = nil
    options.urlSession = URLSession(configuration: session)
    options.beforeSendWithHint = { event, hint in
      // Cocoa 9.29 sends the callback's attachment list. Clear even empty or
      // crash-recovered attachments, independently of the size/source guards.
      hint.attachments = []
      return reportingEnabled ? scrub(event) : nil
    }
  }

  private static func scrub(_ event: Event) -> Event? {
    guard event.type == nil || event.type == "default",
          event.level == .error || event.level == .fatal,
          let exceptions = event.exceptions, !exceptions.isEmpty else { return nil }

    // Preserve the SDK's native duplicate exclusion: these JS errors are
    // already reported through the separately scrubbed JavaScript pipeline.
    if exceptions.contains(where: {
      $0.type?.contains("Unhandled JS Exception") == true ||
      $0.value?.contains("ExceptionsManager.reportException") == true
    }) { return nil }

    // Construct an allowlist instead of mutating the input. This also excludes
    // future SDK context, serialized breadcrumbs, errors and arbitrary extras.
    guard let environment = event.environment,
          ["development", "staging", "production"].contains(environment) else { return nil }
    let clean = Event(level: event.level)
    clean.eventId = event.eventId
    clean.timestamp = event.timestamp
    clean.platform = "cocoa"
    clean.environment = environment

    // A crash can be recovered after an app upgrade. Preserve its numeric
    // release/build metadata instead of assigning the current binary's version.
    let cached = cachedRelease(event.releaseName)
    let version = cached?.version
      ?? versionNumber(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString"))
      ?? "0"
    let build = versionNumber(event.dist) ?? cached?.build
      ?? versionNumber(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion"))
      ?? "0"
    clean.releaseName = "justgo-mobile@\(version)"
    clean.dist = build
    // Crash callbacks can run off the main thread; avoid UIKit actor access.
    let os = ProcessInfo.processInfo.operatingSystemVersion
    clean.context = [
      "app": ["app_version": version, "app_build": build],
      "os": ["name": "iOS", "version": "\(os.majorVersion).\(os.minorVersion).\(os.patchVersion)"]
    ]
    clean.sdk = ["name": "sentry.cocoa", "version": "9.29.0"]
    let user = User()
    user.ipAddress = "0.0.0.0"
    clean.user = user

    clean.exceptions = exceptions.prefix(10).map { original in
      let allowedTypes = [
        "EXC_BAD_ACCESS", "EXC_BAD_INSTRUCTION", "EXC_ARITHMETIC",
        "EXC_BREAKPOINT", "EXC_CRASH", "EXC_GUARD", "EXC_RESOURCE",
        "SIGABRT", "SIGBUS", "SIGFPE", "SIGILL", "SIGSEGV", "SIGTRAP",
        "NSInvalidArgumentException", "NSRangeException", "NSInternalInconsistencyException"
      ]
      let type = original.type.flatMap { allowedTypes.contains($0) ? $0 : nil } ?? "NativeError"
      let exception = Exception(value: "Native application failure", type: type)
      exception.threadId = original.threadId
      exception.stacktrace = stack(original.stacktrace)
      let mechanism = Mechanism(type: "generic")
      mechanism.handled = false
      exception.mechanism = mechanism
      return exception
    }
    clean.stacktrace = stack(event.stacktrace)
    clean.threads = event.threads?.prefix(64).map { original in
      let thread = SentryThread(threadId: original.threadId)
      thread.crashed = original.crashed
      thread.current = original.current
      thread.isMain = original.isMain
      thread.stacktrace = stack(original.stacktrace)
      return thread
    }
    clean.debugMeta = event.debugMeta?.prefix(512).enumerated().compactMap { index, original in
      guard let debugID = original.debugID,
            UUID(uuidString: debugID) != nil,
            let imageAddress = address(original.imageAddress) else { return nil }
      let image = DebugMeta()
      image.type = "macho"
      image.debugID = debugID
      image.imageAddress = imageAddress
      image.imageVmAddress = self.address(original.imageVmAddress)
      image.imageSize = original.imageSize
      // UUID + addresses resolve debug symbols; never send sandbox/user paths.
      image.codeFile = "image-\(index)"
      return image
    }
    return clean
  }

  private static func stack(_ original: SentryStacktrace?) -> SentryStacktrace? {
    guard let original else { return nil }
    let frames = original.frames.prefix(200).map { original in
      let frame = Frame()
      frame.instructionAddress = address(original.instructionAddress)
      frame.imageAddress = address(original.imageAddress)
      frame.symbolAddress = address(original.symbolAddress)
      frame.inApp = original.inApp
      // Raw functions, files, source context and register/memory values stay local.
      return frame
    }
    return SentryStacktrace(frames: frames, registers: [:])
  }

  private static func address(_ value: String?) -> String? {
    guard let value,
          value.range(of: "^0x[0-9a-fA-F]{1,16}$", options: .regularExpression) != nil
    else { return nil }
    return value
  }

  private static func cachedRelease(_ value: String?) -> (version: String, build: String?)? {
    guard let value, value.count <= 256 else { return nil }
    let parts = value.split(separator: "@", omittingEmptySubsequences: false)
    guard parts.count == 2,
          parts[0] == "justgo-mobile" || String(parts[0]) == Bundle.main.bundleIdentifier
    else { return nil }
    let metadata = parts[1].split(separator: "+", omittingEmptySubsequences: false)
    guard (1...2).contains(metadata.count),
          let version = versionNumber(String(metadata[0])) else { return nil }
    let build = metadata.count == 2 ? versionNumber(String(metadata[1])) : nil
    return (version: version, build: build)
  }

  private static func versionNumber(_ value: Any?) -> String? {
    guard let value = value as? String,
          value.count <= 48,
          value.range(of: "^[0-9]+(?:\\.[0-9]+){0,3}$", options: .regularExpression) != nil
    else { return nil }
    return value
  }
}
${end}
`;
}

function protectAppDelegate(modResults, configuration) {
  if (modResults.language !== 'swift') {
    throw new Error(
      'JustGO Sentry privacy requires a reviewed Swift AppDelegate',
    );
  }
  let contents = modResults.contents;
  const hasBegin = contents.includes(begin);
  const hasEnd = contents.includes(end);
  if (hasBegin !== hasEnd) {
    throw new Error('JustGO Sentry privacy block is incomplete');
  }
  if (hasBegin) {
    const blocks = contents.split(begin).length - 1;
    if (blocks !== 1 || contents.split(end).length - 1 !== 1) {
      throw new Error('JustGO Sentry privacy block is duplicated');
    }
    contents = contents.replace(new RegExp(`${begin}[\\s\\S]*?${end}\\n?`), '');
    // Reconcile our earlier generated init in memory when upgrading the plugin.
    contents = contents
      .replace(legacyGuardedCall, '')
      .replace(legacyNativeCall, '')
      .replace(
        new RegExp(
          `^[\\t ]*${launchCall.replace(/[().]/g, '\\$&')}[\\t ]*\\n`,
          'm',
        ),
        '',
      );
  }
  if (
    /(?:RNSentrySDK|SentrySDK)\.start\b|JustGODiagnostics\.start\s*\(/.test(
      contents,
    )
  ) {
    throw new Error(
      'JustGO Sentry privacy refuses an unowned native initialization',
    );
  }
  // Match the installed Expo 58 launch method, not open-URL/linking overloads.
  const launch =
    /\bfunc application\(\s*_\s+application:\s*UIApplication,\s*didFinishLaunchingWithOptions\s+launchOptions:\s*\[UIApplication\.LaunchOptionsKey:\s*Any\]\?\s*=\s*nil\s*\)\s*->\s*Bool\s*\{/g;
  if ((contents.match(launch) ?? []).length !== 1) {
    throw new Error(
      'JustGO Sentry privacy requires the reviewed Expo 58 launch method',
    );
  }
  contents = contents.replace(launch, `$&\n    ${launchCall}`);
  if (!/^import Sentry\s*$/m.test(contents)) {
    contents = `import Sentry\n${contents}`;
  }
  for (const framework of ['Foundation', 'UIKit']) {
    if (!new RegExp(`^import ${framework}\\s*$`, 'm').test(contents)) {
      contents = `import ${framework}\n${contents}`;
    }
  }
  contents = contents.trimEnd();
  return {
    ...modResults,
    contents: `${contents}\n\n${swift(configuration).trim()}\n`,
  };
}

const uploadBegin = '# BEGIN JustGO Sentry uploads';
const uploadEnd = '# END JustGO Sentry uploads';

function protectBuildScripts(project, enabled) {
  const phases = project.hash?.project?.objects?.PBXShellScriptBuildPhase;
  if (!phases)
    throw new Error('JustGO Sentry requires reviewed Xcode build phases');
  const found = { bundle: 0, symbols: 0 };
  for (const [key, phase] of Object.entries(phases)) {
    if (key.endsWith('_comment') || typeof phase !== 'object' || !phase)
      continue;
    let code;
    try {
      code = JSON.parse(phase.shellScript);
    } catch {
      continue;
    }
    if (typeof code !== 'string') continue;
    const kind = code.includes('sentry-xcode-debug-files.sh')
      ? 'symbols'
      : code.includes('sentry-xcode.sh')
        ? 'bundle'
        : undefined;
    if (!kind) continue;
    found[kind] += 1;
    if (code.includes(uploadBegin) !== code.includes(uploadEnd))
      throw new Error('JustGO Sentry upload prefix is incomplete');
    if (
      code.split(uploadBegin).length - 1 > 1 ||
      code.split(uploadEnd).length - 1 > 1
    )
      throw new Error('JustGO Sentry upload prefix is duplicated');
    code = code.replace(
      new RegExp(`${uploadBegin}[\\s\\S]*?${uploadEnd}\\n?`),
      '',
    );
    // Reconcile the older official plugin's inline disabled-upload setting.
    code = code.replace(/^export SENTRY_DISABLE_AUTO_UPLOAD=true\r?\n/gm, '');
    if (
      code.includes('SENTRY_DISABLE_AUTO_UPLOAD') ||
      code.includes('SENTRY_ALLOW_FAILURE')
    )
      throw new Error('JustGO Sentry refuses an unreviewed upload bypass');
    const prefix = `${uploadBegin}
if [ "${enabled}" != "true" ] || [ "\${CONFIGURATION:-}" = "Debug" ]; then
  export SENTRY_DISABLE_AUTO_UPLOAD=true
else
  unset SENTRY_DISABLE_AUTO_UPLOAD SENTRY_ALLOW_FAILURE
  if [ -z "\${SENTRY_AUTH_TOKEN:-}" ]; then
    echo "error: Reporting-enabled Release builds require SENTRY_AUTH_TOKEN."
    exit 1
  fi
fi
${uploadEnd}
`;
    phase.shellScript = JSON.stringify(prefix + code);
  }
  if (found.bundle !== 1 || found.symbols !== 1)
    throw new Error(
      'JustGO Sentry requires instrumented bundle and debug-symbol upload phases',
    );
  return project;
}

module.exports = function withSentryPrivacy(config, options) {
  if (sdkVersion !== '8.28.0') {
    throw new Error(
      'JustGO Sentry native privacy requires reviewed SDK 8.28.0 / Cocoa 9.29.0',
    );
  }
  if (!config.platforms || config.platforms.includes('android')) {
    throw new Error('JustGO Sentry native privacy is reviewed for iOS only');
  }
  if (
    !options ||
    typeof options.enabled !== 'boolean' ||
    (options.enabled &&
      (typeof options.dsn !== 'string' ||
        !/^https:\/\/[a-f0-9]{32}@o\d+\.ingest\.us\.sentry\.io\/4512279181459456$/.test(
          options.dsn,
        ) ||
        !['development', 'staging', 'production'].includes(
          options.environment,
        )))
  ) {
    throw new Error(
      'JustGO Sentry native privacy requires validated public configuration',
    );
  }
  const configuration = options.enabled
    ? { enabled: true, dsn: options.dsn, environment: options.environment }
    : { enabled: false, dsn: '', environment: 'development' };
  const configured = withBaseMod(config, {
    platform: 'ios',
    mod: 'appDelegate',
    isProvider: false,
    // The official SDK 8 plugin owns build scripts, not native initialization.
    async action({ modRequest: { nextMod, ...modRequest }, ...modConfig }) {
      const result = await nextMod({ ...modConfig, modRequest });
      result.modResults = protectAppDelegate(result.modResults, configuration);
      return result;
    },
  });
  return withBaseMod(configured, {
    platform: 'ios',
    mod: 'xcodeproj',
    isProvider: false,
    async action({ modRequest: { nextMod, ...modRequest }, ...modConfig }) {
      const result = await nextMod({ ...modConfig, modRequest });
      result.modResults = protectBuildScripts(
        result.modResults,
        configuration.enabled,
      );
      return result;
    },
  });
};
