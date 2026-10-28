import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { getLegalLinks } from '../../lib/legal-links';

/** Keep document destinations and safe opening feedback identical during entry. */
export function useAcceptanceLinks() {
  const legal = getLegalLinks();
  const [linkError, setLinkError] = useState('');
  const mounted = useRef(true);
  const request = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, []);
  const clearLinkError = () => {
    request.current += 1;
    setLinkError('');
  };
  const open = async (url: string | null, label: string) => {
    clearLinkError();
    const currentRequest = request.current;
    try {
      if (!url) throw new Error('Unconfigured legal destination');
      await Linking.openURL(url);
    } catch {
      if (mounted.current && currentRequest === request.current)
        setLinkError(`Couldn’t open the ${label}. Please try again.`);
    }
  };
  return {
    linkError,
    clearLinkError,
    termsUrl: legal.terms ?? undefined,
    privacyUrl: legal.privacy ?? undefined,
    onOpenTerms: () => {
      // Opening failures are handled above, including late native responses.
      void open(legal.terms, 'Terms of Service');
    },
    onOpenPrivacy: () => {
      void open(legal.privacy, 'Privacy Policy');
    },
  };
}
