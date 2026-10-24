import type { ExpoConfig } from 'expo/config';
import { diagnosticConfiguration } from './src/app-support/diagnostics/configuration.ts';

// Existing owner-created Expo project. Never initialize a replacement project.
const projectId = '53cf0560-8ab5-446a-9bc6-deb193b337b5';
const bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER;
const profile = process.env.EAS_BUILD_PROFILE;
const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;
// The fixture simulator profile never inherits the device environment's CloudKit access.
const iCloudContainer =
  profile === 'development-simulator'
    ? undefined
    : process.env.EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER;
const iCloudEnvironment =
  profile === 'development-simulator'
    ? undefined
    : process.env.ICLOUD_CONTAINER_ENVIRONMENT;
if (
  googleIosUrlScheme &&
  !/^com\.googleusercontent\.apps\.[A-Za-z0-9-]+$/.test(googleIosUrlScheme)
)
  throw new Error(
    'Google sign-in requires the configured iOS OAuth URL scheme',
  );
if (iCloudContainer && !/^iCloud\.[A-Za-z0-9.-]+$/.test(iCloudContainer))
  throw new Error(
    'iCloud sync requires the approved CloudKit container identifier',
  );
if (
  (iCloudContainer &&
    iCloudEnvironment !== 'Development' &&
    iCloudEnvironment !== 'Production') ||
  (!iCloudContainer && iCloudEnvironment)
)
  throw new Error(
    'iCloud sync requires a paired container and Development or Production ICLOUD_CONTAINER_ENVIRONMENT',
  );
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
    usesAppleSignIn: true,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      ...(iCloudContainer
        ? { JustGoICloudContainerIdentifier: iCloudContainer }
        : {}),
    },
    ...(iCloudContainer
      ? {
          entitlements: {
            'com.apple.developer.icloud-container-identifiers': [
              iCloudContainer,
            ],
            'com.apple.developer.icloud-services': ['CloudKit'],
            'com.apple.developer.icloud-container-environment':
              iCloudEnvironment,
          },
        }
      : {}),
  },
  plugins: [
    // Keep the existing single-bundle web preview and guarded fixture loading.
    ['expo-router', { asyncRoutes: { web: false } }],
    'expo-dev-client',
    [
      'expo-font',
      {
        fonts: [
          require.resolve('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf'),
          require.resolve('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf'),
          require.resolve('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf'),
        ],
      },
    ],
    'expo-image',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#F9EFE8',
        image: './assets/brand/justgo-mark.png',
        imageWidth: 194,
        resizeMode: 'contain',
      },
    ],
    'expo-apple-authentication',
    ['expo-secure-store', { faceIDPermission: false }],
    ...(iCloudContainer
      ? [
          [
            './plugins/with-icloud-environment.cjs',
            { environment: iCloudEnvironment },
          ] as [string, Record<string, unknown>],
        ]
      : []),
    ...(googleIosUrlScheme
      ? [
          [
            '@react-native-google-signin/google-signin',
            { iosUrlScheme: googleIosUrlScheme },
          ] as [string, Record<string, unknown>],
        ]
      : []),
    [
      'expo-build-properties',
      {
        // Sentry's prebuilt Cocoa framework and native privacy hook use Swift modules.
        // Preserve static linkage across the SDK 58 native rebuild.
        ios: { deploymentTarget: '16.4', useFrameworks: 'static' },
      },
    ],
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
