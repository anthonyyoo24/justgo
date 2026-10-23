describe('Expo project configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.EAS_BUILD_PROFILE;
    delete process.env.IOS_BUNDLE_IDENTIFIER;
    delete process.env.EXPO_PUBLIC_SENTRY_ENABLED;
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT;
    delete process.env.SENTRY_AUTH_TOKEN;
    delete process.env.SENTRY_ENVIRONMENT;
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('links the existing project and retains local development settings', () => {
    const { default: config } = require('./app.config');
    expect(config.slug).toBe('justgo');
    expect(config.owner).toBe('anthonyyoos-team');
    expect(config.extra.eas.projectId).toBe(
      '53cf0560-8ab5-446a-9bc6-deb193b337b5',
    );
    expect(config.ios.bundleIdentifier).toBe('dev.justgo.foundation');
    expect(config.scheme).toBe('justgo');
    expect(config.plugins).toContain('expo-dev-client');
    expect(config.experiments.typedRoutes).toBe(true);
  });

  it('requires explicit valid reporting configuration and installs native privacy after Sentry', () => {
    process.env.EXPO_PUBLIC_SENTRY_ENABLED = 'true';
    expect(() => require('./app.config')).toThrow('Sentry reporting requires');
    jest.resetModules();
    const dsn = `https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/4512279181459456`;
    process.env.EXPO_PUBLIC_SENTRY_DSN = dsn;
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT = 'staging';
    process.env.SENTRY_AUTH_TOKEN = 'private-build-token';
    const { default: config } = require('./app.config');
    expect(config.plugins.slice(-2)).toEqual([
      [
        '@sentry/react-native/expo',
        expect.objectContaining({
          organization: 'anthony-corp',
          project: 'justgo-mobile',
        }),
      ],
      [
        './plugins/with-sentry-privacy.cjs',
        {
          enabled: true,
          dsn,
          environment: 'staging',
        },
      ],
    ]);
    expect(JSON.stringify(config)).not.toContain('private-build-token');
  });

  it('generates static framework linkage so native Sentry scope callbacks remain visible to Swift', async () => {
    const { default: config } = require('./app.config');
    const { default: withBuildProperties } = require('expo-build-properties');
    const plugin = config.plugins.find(
      (entry: unknown) =>
        Array.isArray(entry) && entry[0] === 'expo-build-properties',
    );
    const configured = withBuildProperties(config, plugin[1]);
    const result = await configured.mods.ios.podfileProperties({
      ...configured,
      modRawConfig: configured,
      modResults: {},
      modRequest: {
        projectRoot: '/fixture',
        platformProjectRoot: '/fixture/ios',
        platform: 'ios',
        modName: 'podfileProperties',
        introspect: false,
      },
    });
    expect(result.modResults['ios.useFrameworks']).toBe('static');
    expect(result.modResults['ios.deploymentTarget']).toBe('16.4');
  });

  it('requires a confirmed identifier for EAS builds', () => {
    process.env.EAS_BUILD_PROFILE = 'development';
    expect(() => require('./app.config')).toThrow('IOS_BUNDLE_IDENTIFIER');
  });

  it('reconciles native disabled state even after an enabled prebuild', () => {
    const { default: config } = require('./app.config');
    expect(config.plugins.slice(-2)).toEqual([
      [
        '@sentry/react-native/expo',
        expect.objectContaining({
          project: 'justgo-mobile',
        }),
      ],
      [
        './plugins/with-sentry-privacy.cjs',
        { enabled: false, dsn: '', environment: 'development' },
      ],
    ]);
  });

  it('rejects a conflicting native environment override', () => {
    process.env.EXPO_PUBLIC_SENTRY_ENABLED = 'true';
    process.env.EXPO_PUBLIC_SENTRY_DSN = `https://${'a'.repeat(32)}@o123.ingest.us.sentry.io/4512279181459456`;
    process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT = 'staging';
    process.env.SENTRY_ENVIRONMENT = 'production';
    expect(() => require('./app.config')).toThrow(
      'SENTRY_ENVIRONMENT must match',
    );
  });

  it('uses the confirmed identifier without changing the project', () => {
    process.env.EAS_BUILD_PROFILE = 'development';
    process.env.IOS_BUNDLE_IDENTIFIER = 'com.example.confirmed';
    const { default: config } = require('./app.config');
    expect(config.ios.bundleIdentifier).toBe('com.example.confirmed');
    expect(config.extra.eas.projectId).toBe(
      '53cf0560-8ab5-446a-9bc6-deb193b337b5',
    );
  });

  it('can evaluate the simulator profile without device signing setup', () => {
    const eas = require('./eas.json');
    process.env = {
      ...process.env,
      ...eas.build['development-simulator'].env,
      EAS_BUILD_PROFILE: 'development-simulator',
    };
    const { default: config } = require('./app.config');
    expect(config.ios.bundleIdentifier).toBe('dev.justgo.foundation');
    expect(config.extra.eas.projectId).toBe(
      '53cf0560-8ab5-446a-9bc6-deb193b337b5',
    );
  });
});
