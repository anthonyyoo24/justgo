import { useFocusEffect, useIsFocused } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type {
  ManagedIdentityController,
  ManagedIdentitySnapshot,
} from '../auth/managed-controller';
import type { SignInProvider } from '../auth/types';
import { useCancelWelcomeEntry } from '../welcome/WelcomeTransition';
import { useSignInHandoff } from './useSignInHandoff';

type DirectFailure = {
  message: string;
  reference: string | null;
  owner: string | null;
  provider: SignInProvider | null;
};

/** Provider feedback belongs to this visit; durable work stays in identity. */
export function useProviderSignIn(
  identity: ManagedIdentityController | null,
  snapshot: ManagedIdentitySnapshot | null,
  {
    provider,
    returnToData = false,
    switchProvider = false,
    clearLinkError,
  }: {
    provider?: SignInProvider | undefined;
    returnToData?: boolean;
    switchProvider?: boolean;
    clearLinkError?: () => void;
  } = {},
) {
  // A completed switch may have been resumed by identity during startup or a
  // different visit. Linked identities alone never establish the active login.
  const switchCompleted = !!(
    switchProvider &&
    provider &&
    snapshot?.account &&
    snapshot.provider === provider &&
    !snapshot.hasPending
  );
  const handoffReady = !switchProvider || switchCompleted;
  const handoff = useSignInHandoff(
    useIsFocused() && handoffReady,
    returnToData,
  );
  const cancelWelcomeEntry = useCancelWelcomeEntry();
  const [failure, setFailure] = useState<DirectFailure | null>(null);
  const [pendingProvider, setPendingProvider] = useState<SignInProvider | null>(
    null,
  );
  const visit = useRef<object | null>(null);
  const submitting = useRef<object | null>(null);
  useFocusEffect(
    useCallback(() => {
      visit.current = {
        identity,
        provider,
        returnToData,
        switchProvider,
      };
      setFailure(null);
      setPendingProvider(null);
      return () => {
        visit.current = null;
      };
    }, [identity, provider, returnToData, switchProvider]),
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
    setFailure(null);
    clearLinkError?.();
    if (state.account && handoffReady) {
      handoff.retry();
      return;
    }
    submitting.current = submittedVisit;
    cancelWelcomeEntry();
    setPendingProvider(selected);
    // A switch links the provider to the signed-in account before it signs in.
    await (switchProvider
      ? identity.switchProvider(selected)
      : identity.signIn(selected));
    if (submitting.current === submittedVisit) submitting.current = null;
    if (submittedVisit !== visit.current) return;
    setPendingProvider(null);
    const result = identity.getSnapshot();
    // A switch lands only on the requested provider; the old login staying
    // active after a failed switch is still this visit's failure.
    const landed =
      !!result.account && (!switchProvider || result.provider === selected);
    setFailure(
      !landed && result.directSignInFailure && result.message
        ? {
            message: result.message,
            reference: result.connectionReference,
            owner: result.account?.userId ?? null,
            provider: result.provider,
          }
        : null,
    );
  };
  // Keep this visit's failure, not the live snapshot's: returning from the
  // native sheet foregrounds the app, and that background run republishes the
  // same login with its feedback cleared (#507). A changed login drops it.
  const directFailure =
    failure &&
    failure.owner === (snapshot?.account?.userId ?? null) &&
    failure.provider === (snapshot?.provider ?? null)
      ? failure
      : null;
  const error = directFailure?.message || handoff.error;
  return {
    ...handoff,
    error,
    reference: directFailure?.reference ?? null,
    busyProvider:
      pendingProvider ??
      (snapshot?.account && !error && handoffReady
        ? (provider ?? snapshot.provider ?? 'apple')
        : null),
    retryHandoff: !!error && !!snapshot?.account && handoffReady,
    signIn,
  };
}
