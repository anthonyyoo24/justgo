import type { ReactNativeOptions } from '@sentry/react-native';
import { createErrorReporter } from './reporter';
import { diagnosticConfiguration } from './configuration';
const config = diagnosticConfiguration(
  'true',
  `https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/4512279181459456`,
  'staging',
)!;
const build = {
  version: '0.1.0',
  os: 'ios' as const,
  osVersion: '26.0',
  environment: 'staging' as const,
};
it('stays disabled without validated explicit configuration', () => {
  const sdk = {
    init: jest.fn<void, [ReactNativeOptions]>(),
    captureException: jest.fn<unknown, [Error]>(),
  };
  const reporter = createErrorReporter(sdk);
  expect(reporter.initialize(null, build)).toBe(false);
  expect(reporter.capture(new Error('private'))).toBe(false);
  expect(sdk.init).not.toHaveBeenCalled();
});
it('registers only error handlers and the two independent payload boundaries once', () => {
  const sdk = {
    init: jest.fn<void, [ReactNativeOptions]>(),
    captureException: jest.fn<unknown, [Error]>(),
  };
  const reporter = createErrorReporter(sdk);
  expect(reporter.initialize(config, build)).toBe(true);
  expect(reporter.initialize(config, build)).toBe(false);
  const options: ReactNativeOptions = sdk.init.mock.calls[0]![0];
  expect(options).toMatchObject({
    autoInitializeNativeSdk: false,
    sendDefaultPii: false,
    sendClientReports: false,
    enableAutoSessionTracking: false,
    enableLogs: false,
    enableCaptureFailedRequests: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    maxBreadcrumbs: 0,
    tracePropagationTargets: [],
  });
  expect(options.beforeBreadcrumb?.({})).toBeNull();
  expect(typeof options.integrations).toBe('function');
  if (typeof options.integrations === 'function')
    expect(
      options
        .integrations([
          { name: 'GlobalHandlers' },
          { name: 'Dedupe' },
          { name: 'HttpContext' },
          { name: 'Breadcrumbs' },
          { name: 'Replay' },
        ])
        .map(({ name }) => name),
    ).toEqual(['GlobalHandlers', 'Dedupe']);
  expect(
    options.beforeSend?.({ type: undefined, message: 'private' }, {}),
  ).toBeNull();
  expect(options.transport).toBeDefined();
});
it('isolates initialization and capture failures and deduplicates the same React error', () => {
  const sdk = {
    init: jest.fn<void, [ReactNativeOptions]>(() => {
      throw new Error('provider');
    }),
    captureException: jest.fn<unknown, [Error]>(),
  };
  const reporter = createErrorReporter(sdk);
  expect(reporter.initialize(config, build)).toBe(false);
  expect(reporter.capture(new Error('x'))).toBe(false);
  sdk.init.mockImplementation(() => {});
  expect(reporter.initialize(config, build)).toBe(true);
  const error = new Error('private');
  sdk.captureException.mockImplementation(() => {
    throw new Error('provider');
  });
  expect(reporter.capture(error)).toBe(false);
  expect(reporter.capture(error)).toBe(false);
  sdk.captureException.mockImplementation(() => 'event');
  expect(reporter.capture(new Error('different'))).toBe(true);
});
