import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type {
  ManagedIdentityController,
  ManagedIdentitySnapshot,
} from '../auth/managed-controller';
import type { SignInProvider } from '../auth/types';
import { useCancelWelcomeEntry } from '../welcome/WelcomeTransition';
import { useSignInHandoff } from './useSignInHandoff';

/** Provider feedback belongs to this visit; durable work stays in identity. */
export function useProviderSignIn(
  identity: ManagedIdentityController | null,
  snapshot: ManagedIdentitySnapshot | null,
  {
    provider,
    expectedOwnerId,
    returnToData = false,
    clearLinkError,
  }: {
    provider?: SignInProvider | undefined;
    expectedOwnerId?: string | undefined;
    returnToData?: boolean;
    clearLinkError?: () => void;
  } = {},
) {
  const handoff = useSignInHandoff(useIsFocused(), returnToData);
  const cancelWelcomeEntry = useCancelWelcomeEntry();
  const [showDirectFailure, setShowDirectFailure] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<SignInProvider | null>(
    null,
  );
  const visit = useRef<object | null>(null);
  const submitting = useRef<object | null>(null);
  useFocusEffect(
    useCallback(() => {
      visit.current = { identity, provider, expectedOwnerId, returnToData };
      setShowDirectFailure(false);
      setPendingProvider(null);
      return () => {
        visit.current = null;
      };
    }, [identity, provider, expectedOwnerId, returnToData]),
  );
  const signIn = async (selected: SignInProvider) => {
    const submittedVisit = visit.current;
    const state = identity?.getSnapshot();
    if (
      !identity ||
      !state?.initialized ||
      state.busy ||
      !submittedVisit ||
      submitting.current === submittedVisit
    )
      return;
    setShowDirectFailure(false);
    clearLinkError?.();
    if (state.account) {
      handoff.retry();
      return;
    }
    submitting.current = submittedVisit;
    cancelWelcomeEntry();
    setPendingProvider(selected);
    await identity.signIn(selected, expectedOwnerId ? { expectedOwnerId } : {});
    if (submitting.current === submittedVisit) submitting.current = null;
    if (submittedVisit !== visit.current) return;
    setPendingProvider(null);
    const result = identity.getSnapshot();
    setShowDirectFailure(!result.account && result.directSignInFailure);
  };
  const directFailure = showDirectFailure && snapshot?.directSignInFailure;
  const error = (directFailure ? snapshot.message : '') || handoff.error;
  return {
    ...handoff,
    error,
    reference: directFailure ? snapshot.connectionReference : null,
    busyProvider:
      pendingProvider ??
      (snapshot?.account && !error
        ? (provider ?? snapshot.provider ?? 'apple')
        : null),
    retryHandoff: !!error && !!snapshot?.account,
    signIn,
  };
}
