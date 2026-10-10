import { publicHttpsUrl } from '../../lib/public-url';

export const appleStandardTerms =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** Public notices stay independent of account credentials and paid access. */
export function getLegalLinks(
  privacy = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
  terms = process.env.EXPO_PUBLIC_TERMS_URL,
) {
  return {
    privacy: publicHttpsUrl(privacy),
    terms: publicHttpsUrl(terms || appleStandardTerms),
  };
}
