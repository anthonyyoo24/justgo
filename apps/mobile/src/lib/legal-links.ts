import { publicHttpsUrl } from './network/public-url';

/** An explicit local reader supports phone testing without publishing the site. */
function developmentReaderUrl(value: string | undefined) {
  try {
    const url = new URL(value ?? '');
    const [first, second = -1] = url.hostname.split('.').map(Number);
    const privateIpv4 =
      /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) &&
      (first === 10 ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168));
    if (
      url.protocol === 'http:' &&
      (privateIpv4 ||
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
      return url.href;
  } catch {
    /* Missing or invalid configuration never becomes a destination. */
  }
  return null;
}

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
  const localPrivacy = development ? developmentReaderUrl(privacy) : null;
  const localTerms = development ? developmentReaderUrl(terms) : null;
  return {
    privacy: useDraftPrivacy
      ? `${draftOrigin}/legal/privacy`
      : (publicHttpsUrl(privacy) ?? localPrivacy),
    terms: useDraftTerms
      ? `${draftOrigin}/legal/terms`
      : (publicHttpsUrl(terms) ?? localTerms),
    development:
      useDraftPrivacy || useDraftTerms || !!localPrivacy || !!localTerms,
  };
}
