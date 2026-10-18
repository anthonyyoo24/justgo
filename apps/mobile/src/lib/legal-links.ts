import { publicHttpsUrl } from './network/public-url';

/** Public notices stay independent of account credentials and paid access. */
export function getLegalLinks(
  privacy = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
  terms = process.env.EXPO_PUBLIC_TERMS_URL,
  api = process.env.EXPO_PUBLIC_API_URL,
  development = __DEV__,
) {
  let draftOrigin: string | null = null;
  if (development) {
    try {
      const url = new URL(api ?? '');
      if (
        ['http:', 'https:'].includes(url.protocol) &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === '/'
      )
        draftOrigin = url.origin;
    } catch {
      /* Unconfigured origins never become legal destinations. */
    }
  }
  const useDraftPrivacy = !privacy && !!draftOrigin;
  const useDraftTerms = !terms && !!draftOrigin;
  return {
    privacy: useDraftPrivacy
      ? `${draftOrigin}/legal/privacy`
      : publicHttpsUrl(privacy),
    terms: useDraftTerms ? `${draftOrigin}/legal/terms` : publicHttpsUrl(terms),
    development: useDraftPrivacy || useDraftTerms,
  };
}
