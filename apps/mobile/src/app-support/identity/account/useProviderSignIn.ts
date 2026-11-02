import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { ManagedIdentityController } from '../auth/managed-controller';
import type { SignInProvider } from '../auth/types';
import { useCancelWelcomeEntry } from '../welcome/WelcomeTransition';
import { useSignInHandoff } from './useSignInHandoff';

/** Provider feedback belongs to this visit; durable work stays in identity. */
export function useProviderSignIn(
  identity: ManagedIdentityController | null,
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
  const [error, setError] = useState('');
  const [reference, setReference] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [pendingProvider, setPendingProvider] = useState<SignInProvider | null>(
    null,
  );
  const visit = useRef<object | null>(null);
  const submitting = useRef<object | null>(null);
  useFocusEffect(
    useCallback(() => {
      visit.current = { identity, provider, expectedOwnerId, returnToData };
      setError('');
      setReference(null);
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
    setError('');
    setReference(null);
    setAttempted(true);
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
    if (!result.account) {
      setError(result.message);
      setReference(result.connectionReference);
    }
  };
  return {
    ...handoff,
    error: error || handoff.error,
    reference,
    attempted,
    pendingProvider,
    signIn,
  };
}
