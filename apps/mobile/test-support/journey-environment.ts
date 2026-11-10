// Expo SDK 57's virtual env can prefer .env.local over CLI values even with
// EXPO_NO_DOTENV. Guarded web journeys use the CLI's public runtime values instead.
// Dynamic property access deliberately avoids another virtual-env rewrite.
const names = [
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_PROJECT_ROOT',
  'EXPO_PUBLIC_SENTRY_ENABLED',
  'EXPO_PUBLIC_SENTRY_DSN',
  'EXPO_PUBLIC_SENTRY_ENVIRONMENT',
];
export const env = Object.fromEntries(
  names.map((name) => [name, process.env[name]]),
);
// The app links its /legal drafts only for an API at a loopback origin root.
// Under a path prefix, name the same fixture drafts as explicit local readers.
const api = env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
if (api && new URL(api).pathname !== '/') {
  env.EXPO_PUBLIC_TERMS_URL = `${api}/legal/terms`;
  env.EXPO_PUBLIC_PRIVACY_POLICY_URL = `${api}/legal/privacy`;
}
// This module is selected only after Metro validates the disposable loopback
// database and API. The normal virtual environment never receives this marker.
env.EXPO_PUBLIC_JUSTGO_JOURNEY_FIXTURE = '1';
