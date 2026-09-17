import type { ExpoConfig } from 'expo/config';

// Existing owner-created Expo project. Never initialize a replacement project.
const projectId = '53cf0560-8ab5-446a-9bc6-deb193b337b5';
const bundleIdentifier = process.env.IOS_BUNDLE_IDENTIFIER;
const profile = process.env.EAS_BUILD_PROFILE;
if (profile && !bundleIdentifier)
  throw new Error('EAS builds require the confirmed IOS_BUNDLE_IDENTIFIER');

const config: ExpoConfig = {
  name: 'JustGO',
  slug: 'justgo',
  owner: 'anthonyyoos-team',
  version: '0.1.0',
  scheme: 'justgo',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  platforms: ['ios', 'web'],
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
  ],
  web: { bundler: 'metro', output: 'single', name: 'JustGO Foundation' },
  extra: { eas: { projectId } },
};
export default config;
