import { useEffect } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useIdentity, useRuntime } from '../providers/AppProvider';
import { AcceptanceView } from './AcceptanceView';
import { useAcceptanceLinks } from './useAcceptanceLinks';
import { useWelcomeTransition } from '../identity/welcome/WelcomeTransition';

/** Account creation is an explicit action; reading this route cannot create an account. */
export function AcceptanceScreen() {
  const { identity } = useRuntime();
  const state = useIdentity();
  const router = useRouter();
  const params = useLocalSearchParams<{
    returnTo?: string;
    create?: string;
    from?: string;
  }>();
  const { linkError, clearLinkError, ...links } = useAcceptanceLinks();
  const awaitingPreparation = useWelcomeTransition();
  const creatingNew =
    params.create === 'new' &&
    (!state.account || state.account.userId === params.from);
  const pendingDeletion =
    state.deletionStatus === 'pending' || state.deletionStatus === 'cleanup';
  const connected = !pendingDeletion && !!state.account && !creatingNew;
  useEffect(() => {
    if (connected && !awaitingPreparation && params.returnTo === 'recovery')
      router.dismissTo('/recovery');
  }, [connected, awaitingPreparation, params.returnTo, router]);
  if (pendingDeletion) return <Redirect href="/delete-account" />;
  if (connected && !awaitingPreparation)
    return params.returnTo === 'recovery' ? null : <Redirect href="/access" />;

  const continueToApp = async () => {
    if (state.busy || !state.initialized || connected) return;
    // A previous or pending document opening must not mask account feedback.
    clearLinkError();
    if (creatingNew || !identity.getSnapshot().account) {
      // Identity owns persistence, network errors and exact-proof retries.
      await identity.createAccount();
    }
  };
  return (
    <AcceptanceView
      busy={state.busy || !state.initialized || connected}
      busyLabel={
        connected ? 'Preparing your challenges' : 'Creating your account'
      }
      error={
        linkError ||
        (state.message === 'Your account has been deleted.' ||
        state.message === 'Your account is connected.'
          ? ''
          : state.message)
      }
      {...links}
      onContinue={() => {
        void continueToApp();
      }}
    />
  );
}
