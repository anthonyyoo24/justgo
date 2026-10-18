import type { ExpoConfig } from 'expo/config';
import { diagnosticConfiguration } from './src/app-support/diagnostics/configuration.ts';

// Existing owner-created Expo project. Never initialize a replacement project.
const projectId = '53cf0560-8ab5-446a-9bc6-deb193b337b5';
const bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER;
const profile = process.env.EAS_BUILD_PROFILE;
if (profile && !bundleIdentifier)
  throw new Error('EAS builds require the confirmed IOS_BUNDLE_IDENTIFIER');

const sentry = diagnosticConfiguration(
  process.env.EXPO_PUBLIC_SENTRY_ENABLED,
  process.env.EXPO_PUBLIC_SENTRY_DSN,
  process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT,
);
if (process.env.EXPO_PUBLIC_SENTRY_ENABLED === 'true' && !sentry)
  throw new Error(
    'Sentry reporting requires valid reviewed US project configuration',
  );
if (
  sentry &&
  process.env.SENTRY_ENVIRONMENT &&
  process.env.SENTRY_ENVIRONMENT !== sentry.environment
)
  throw new Error(
    'SENTRY_ENVIRONMENT must match EXPO_PUBLIC_SENTRY_ENVIRONMENT',
  );

const config: ExpoConfig = {
  name: 'JustGO',
  slug: 'justgo',
  owner: 'anthonyyoos-team',
  version: '0.1.0',
  scheme: 'justgo',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['ios', 'web'],
  experiments: { typedRoutes: true },
  ios: {
    // Local simulator identifier only. Reserve the permanent identifier before device recovery work.
    bundleIdentifier: bundleIdentifier ?? 'dev.justgo.foundation',
    supportsTablet: false,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  plugins: [
    'expo-router',
    'expo-dev-client',
    'expo-font',
    'expo-image',
    ['expo-build-properties', { ios: { deploymentTarget: '16.4' } }],
    [
      '@sentry/react-native/expo',
      {
        organization: 'anthony-corp',
        project: 'justgo-mobile',
        url: 'https://sentry.io/',
      },
    ] as [string, Record<string, unknown>],
    [
      './plugins/with-sentry-privacy.cjs',
      {
        enabled: !!sentry,
        dsn: sentry?.dsn ?? '',
        environment: sentry?.environment ?? 'development',
      },
    ],
  ],
  web: {
    bundler: 'metro',
    output: 'single',
    name: 'JustGO Development Preview',
  },
  extra: { eas: { projectId } },
};
export default config;
