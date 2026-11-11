export const analyticsPackages = [
  '@adjustcom/*',
  '@amplitude/*',
  'amplitude-js',
  '@aptabase/*',
  'branch-sdk',
  '@datadog/browser-rum*',
  '@datadog/mobile-react-native*',
  'expo-firebase-analytics',
  'expo-insights',
  'expo-tracking-transparency',
  '@firebase/analytics*',
  'firebase/analytics',
  '@heap/*',
  'mixpanel*',
  '@posthog/*',
  'posthog-*',
  'react-ga',
  'react-ga4',
  'react-native-adjust',
  'react-native-appsflyer',
  'react-native-branch',
  '@react-native-firebase/analytics',
  'react-native-tracking-transparency',
  '@rudderstack/*',
  '@segment/*',
  '@statsig/*',
  'statsig-*',
  '@vercel/analytics',
  '@vercel/speed-insights',
];

export const analyticsFix =
  'Product analytics stays uninstalled through beta and paid launch. Phase 17 in docs/implementation-plan/README.md must first review the real permission and collection design, and identity, writing, recovery and deletion never depend on analytics. Remove it. Activating analytics needs that review first, then a change to scripts/quality/analytics-packages.mjs.';

export const analyticsPackageOf = (specifier) =>
  analyticsPackages.find((entry) =>
    entry.endsWith('*')
      ? specifier.startsWith(entry.slice(0, -1))
      : specifier === entry || specifier.startsWith(`${entry}/`),
  );
