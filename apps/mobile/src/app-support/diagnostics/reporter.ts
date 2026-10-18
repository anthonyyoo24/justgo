import type { ReactNativeOptions } from '@sentry/react-native';
import type { DiagnosticConfiguration } from './configuration';
import { diagnosticEvent, type DiagnosticBuild } from './event';
import { errorTransport } from './transport';

type ErrorSdk = {
  init: (options: ReactNativeOptions) => void;
  captureException: (error: Error) => unknown;
};
const errorIntegrations = new Set([
  'ReactNativeErrorHandlers',
  'GlobalHandlers',
  'BrowserApiErrors',
  'Dedupe',
  'RewriteFrames',
  'DebugMeta',
]);

export function createErrorReporter(sdk: ErrorSdk) {
  let initialized = false;
  const seen = new WeakSet<Error>();
  return {
    initialize(config: DiagnosticConfiguration | null, build: DiagnosticBuild) {
      if (initialized || !config) return false;
      try {
        sdk.init({
          dsn: config.dsn,
          environment: config.environment,
          release: `justgo-mobile@${build.version}`,
          // The Expo native hook owns native privacy. JS cannot overwrite that callback.
          autoInitializeNativeSdk: false,
          enableNativeNagger: false,
          sendDefaultPii: false,
          sendClientReports: false,
          enableAutoSessionTracking: false,
          enableLogs: false,
          enableAppStartTracking: false,
          enableAutoPerformanceTracing: false,
          enableNativeFramesTracking: false,
          enableStallTracking: false,
          enableWatchdogTerminationTracking: false,
          enableCaptureFailedRequests: false,
          attachScreenshot: false,
          attachViewHierarchy: false,
          maxBreadcrumbs: 0,
          maxQueueSize: 2,
          tracePropagationTargets: [],
          debug: false,
          integrations: (defaults) =>
            defaults.filter(({ name }) => errorIntegrations.has(name)),
          beforeBreadcrumb: () => null,
          beforeSend: (event) => diagnosticEvent(event, build),
          transport: () => errorTransport(config, build),
        });
        initialized = true;
        return true;
      } catch {
        return false;
      }
    },
    capture(error: Error) {
      if (!initialized || seen.has(error)) return false;
      try {
        seen.add(error);
        sdk.captureException(error);
        return true;
      } catch {
        // Error reporting can never replace the original recoverable crash screen.
        return false;
      }
    },
  };
}
