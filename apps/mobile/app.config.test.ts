describe('Expo project configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.EAS_BUILD_PROFILE;
    delete process.env.IOS_BUNDLE_IDENTIFIER;
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
  });

  it('requires a confirmed identifier for EAS builds', () => {
    process.env.EAS_BUILD_PROFILE = 'development';
    expect(() => require('./app.config')).toThrow('IOS_BUNDLE_IDENTIFIER');
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
