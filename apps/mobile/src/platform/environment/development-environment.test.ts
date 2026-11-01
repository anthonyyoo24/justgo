const originalEnvironment = process.env;
beforeEach(() => {
  jest.resetModules();
  process.env = { NODE_ENV: 'test' };
});
afterEach(() => {
  process.env = originalEnvironment;
});

it('reads the launcher public pairing without another static environment rewrite', () => {
  const publicValues = {
    EXPO_PUBLIC_API_URL: 'https://worker.example',
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: 'dev-ios',
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: 'existing-web',
    EXPO_PUBLIC_SUPABASE_URL: 'https://auth.example',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-test-value',
    EXPO_PUBLIC_SENTRY_ENABLED: 'false',
    EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://legal.example/privacy/',
    EXPO_PUBLIC_TERMS_URL: 'https://legal.example/terms/',
    EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER: 'iCloud.dev',
  };
  process.env = { NODE_ENV: 'test', ...publicValues };
  const { env } = require('./development-environment');
  expect(env).toMatchObject(publicValues);
  expect(env.EXPO_PUBLIC_APP_STORE_ID).toBeUndefined();
});

it('does not expose private values, arbitrary public flags or journey authorization', () => {
  process.env = {
    NODE_ENV: 'test',
    SECRET_KEY: 'private-test-value',
    EXPO_PUBLIC_UNREVIEWED: 'unreviewed',
    EXPO_PUBLIC_JUSTGO_JOURNEY_FIXTURE: '1',
    JUSTGO_JOURNEY_FIXTURES: '1',
  };
  const { env } = require('./development-environment');
  expect(env).not.toHaveProperty('SECRET_KEY');
  expect(env).not.toHaveProperty('EXPO_PUBLIC_UNREVIEWED');
  expect(env).not.toHaveProperty('EXPO_PUBLIC_JUSTGO_JOURNEY_FIXTURE');
  expect(Object.values(env).every((value) => value === undefined)).toBe(true);
});
