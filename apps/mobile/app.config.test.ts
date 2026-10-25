import { readFileSync } from 'node:fs';
import path from 'node:path';

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
    delete process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
    delete process.env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER;
    delete process.env.ICLOUD_CONTAINER_ENVIRONMENT;
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
    expect(config.plugins).toContainEqual([
      'expo-router',
      { asyncRoutes: { web: false } },
    ]);
    expect(config.web.output).toBe('single');
  });

  it('uses the approved mark and cream for the native launch screen', () => {
    const { default: config } = require('./app.config');
    expect(config.plugins).toContainEqual([
      'expo-splash-screen',
      {
        backgroundColor: '#F9EFE8',
        image: './assets/brand/justgo-mark.png',
        imageWidth: 194,
        resizeMode: 'contain',
      },
    ]);
  });

  it('packages an opaque 1024-pixel branded store icon', () => {
    const { default: config } = require('./app.config');
    expect(config.icon).toBe('./assets/brand/justgo-app-icon.png');
    const icon = readFileSync(path.resolve(__dirname, config.icon));
    expect(icon.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(icon.subarray(12, 16).toString()).toBe('IHDR');
    expect(icon.readUInt32BE(16)).toBe(1024);
    expect(icon.readUInt32BE(20)).toBe(1024);
    // RGB (PNG type 2), rather than a transparent placeholder or alpha channel.
    expect(icon[25]).toBe(2);
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

  it('omits iCloud configuration until both native inputs are supplied', () => {
    const { default: config } = require('./app.config');
    expect(config.ios.infoPlist).not.toHaveProperty(
      'JustGoICloudContainerIdentifier',
    );
    expect(config.ios.entitlements).toBeUndefined();
    expect(config.ios.usesAppleSignIn).toBe(true);
  });

  it.each(['Development', 'Production'])(
    'configures matching private CloudKit container and %s environment',
    (environment) => {
      process.env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER =
        'iCloud.com.example.justgo';
      process.env.ICLOUD_CONTAINER_ENVIRONMENT = environment;
      const { default: config } = require('./app.config');
      expect(config.ios.infoPlist.JustGoICloudContainerIdentifier).toBe(
        'iCloud.com.example.justgo',
      );
      expect(config.ios.entitlements).toEqual({
        'com.apple.developer.icloud-container-identifiers': [
          'iCloud.com.example.justgo',
        ],
        'com.apple.developer.icloud-services': ['CloudKit'],
        'com.apple.developer.icloud-container-environment': environment,
      });
      expect(config.ios.usesAppleSignIn).toBe(true);
    },
  );

  it('retains the CloudKit environment after DocumentPicker strips its CloudDocuments setting', async () => {
    process.env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER =
      'iCloud.com.example.justgo';
    process.env.ICLOUD_CONTAINER_ENVIRONMENT = 'Production';
    const { default: config } = require('./app.config');
    const withICloudEnvironment = require('./plugins/with-icloud-environment.cjs');
    const {
      default: withDocumentPicker,
    } = require('expo-document-picker/app.plugin.js');
    const options = config.plugins.find(
      (entry: unknown) =>
        Array.isArray(entry) &&
        entry[0] === './plugins/with-icloud-environment.cjs',
    )[1];
    const configured = withICloudEnvironment(
      withDocumentPicker(config),
      options,
    );
    const result = await configured.mods.ios.entitlements({
      ...configured,
      modResults: { ...config.ios.entitlements },
      modRequest: {
        projectRoot: '/fixture',
        platformProjectRoot: '/fixture/ios',
        platform: 'ios',
        modName: 'entitlements',
        introspect: true,
      },
    });
    expect(result.modResults).toEqual(config.ios.entitlements);
    expect(result.modResults['com.apple.developer.icloud-services']).toEqual([
      'CloudKit',
    ]);
    expect(result.modResults).not.toHaveProperty(
      'com.apple.developer.ubiquity-container-identifiers',
    );
  });

  it.each([
    ['com.example.justgo', 'Production', 'approved CloudKit container'],
    ['iCloud.com.example.justgo', undefined, 'paired container'],
    ['iCloud.com.example.justgo', 'production', 'paired container'],
    [undefined, 'Production', 'paired container'],
  ])(
    'rejects mismatched iCloud inputs %s / %s',
    (container, environment, error) => {
      if (container)
        process.env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER = container;
      if (environment) process.env.ICLOUD_CONTAINER_ENVIRONMENT = environment;
      expect(() => require('./app.config')).toThrow(error);
    },
  );

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
      EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER: 'iCloud.com.example.justgo',
      ICLOUD_CONTAINER_ENVIRONMENT: 'Production',
    };
    const { default: config } = require('./app.config');
    expect(config.ios.bundleIdentifier).toBe('dev.justgo.foundation');
    expect(config.extra.eas.projectId).toBe(
      '53cf0560-8ab5-446a-9bc6-deb193b337b5',
    );
    expect(config.ios.entitlements).toBeUndefined();
    expect(config.ios.infoPlist).not.toHaveProperty(
      'JustGoICloudContainerIdentifier',
    );
  });
});
