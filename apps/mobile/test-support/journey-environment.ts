// Expo SDK 57's virtual env can prefer .env.local over CLI values even with
// EXPO_NO_DOTENV. Guarded web journeys use the CLI's public runtime values instead.
// Dynamic property access deliberately avoids another virtual-env rewrite.
const names = ['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_PROJECT_ROOT'];
export const env = Object.fromEntries(
  names.map((name) => [name, process.env[name]]),
);
