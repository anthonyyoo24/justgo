export const appleStandardTerms =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

function publicHttpsUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? '');
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

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
