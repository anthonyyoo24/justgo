/** Synthetic public Dev pairing shared by launcher and Metro guard tests. */
export function publicEnvironment() {
  return {
    IOS_BUNDLE_IDENTIFIER: 'com.anthonyyoo.justgo.dev',
    EXPO_PUBLIC_ICLOUD_CONTAINER_IDENTIFIER: 'iCloud.com.anthonyyoo.justgo.dev',
    ICLOUD_CONTAINER_ENVIRONMENT: 'Production',
    EXPO_PUBLIC_API_URL:
      'https://kmcpcauaxlgpevkkenwd.supabase.co/functions/v1/api',
    EXPO_PUBLIC_SUPABASE_URL: 'https://kmcpcauaxlgpevkkenwd.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_synthetic',
    EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: '123-dev.apps.googleusercontent.com',
    EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME: 'com.googleusercontent.apps.123-dev',
    EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID: '123-web.apps.googleusercontent.com',
    EXPO_PUBLIC_SENTRY_ENABLED: 'false',
    EXPO_PUBLIC_PRIVACY_POLICY_URL: 'https://justgo-legal.vercel.app/privacy/',
    EXPO_PUBLIC_TERMS_URL: 'https://justgo-legal.vercel.app/terms/',
  };
}
