const originalEnvironment = process.env;
beforeEach(() => {
  jest.resetModules();
  process.env = { ...originalEnvironment };
  delete process.env.EXPO_PUBLIC_SENTRY_ENABLED;
  delete process.env.EXPO_PUBLIC_SENTRY_DSN;
  delete process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
});
afterEach(() => {
  process.env = originalEnvironment;
});

it('does not initialize the provider in an ordinary disabled build', () => {
  require('./start');
  expect(require('@sentry/react-native').init).not.toHaveBeenCalled();
});

it.each(['ios', 'web'])(
  'initializes reviewed %s build metadata before route capture',
  (os) => {
    process.env.EXPO_PUBLIC_SENTRY_ENABLED = 'true';
    process.env.EXPO_PUBLIC_SENTRY_DSN = `https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/4512279181459456`;
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT = 'staging';
    jest.doMock('expo-constants', () => ({
      __esModule: true,
      default: { expoConfig: { version: '0.1.0' }, nativeBuildVersion: '3' },
    }));
    jest.doMock('react-native', () => ({
      Platform: { OS: os, Version: '26.0' },
    }));
    const { errorReporter } = require('./start');
    const sdk = require('@sentry/react-native');
    const options = sdk.init.mock.calls[0][0];
    const event = options.beforeSend({ exception: { values: [{}] } }, {});
    expect(event).toMatchObject({
      release: 'justgo-mobile@0.1.0',
      dist: '3',
      environment: 'staging',
      contexts: { os: { name: os === 'ios' ? 'iOS' : 'Web', version: '26.0' } },
    });
    const error = new Error('private fixture');
    expect(errorReporter.capture(error)).toBe(true);
    expect(sdk.captureException).toHaveBeenCalledWith(error);
  },
);
