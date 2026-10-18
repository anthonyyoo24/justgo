import { useEffect } from 'react';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import {
  useAcceptance,
  useIdentity,
  useRuntime,
} from '../providers/AppProvider';
import { AcceptanceView } from './AcceptanceView';
import { useAcceptanceLinks } from './useAcceptanceLinks';
import { useWelcomeTransition } from '../identity/welcome/WelcomeTransition';

/** Account creation is an explicit action; reading this route cannot create an account. */
export function AcceptanceScreen() {
  const { identity, acceptance } = useRuntime();
  const state = useIdentity();
  const receipt = useAcceptance();
  const router = useRouter();
  const params = useLocalSearchParams<{
    returnTo?: string;
    create?: string;
    from?: string;
  }>();
  const { linkError, ...links } = useAcceptanceLinks();
  const awaitingPreparation = useWelcomeTransition();
  const creatingNew =
    params.create === 'new' &&
    (!state.account || state.account.userId === params.from);
  const pendingDeletion =
    state.deletionStatus === 'pending' || state.deletionStatus === 'cleanup';
  const accepted =
    !pendingDeletion &&
    !!state.account &&
    !creatingNew &&
    receipt.userId === state.account.userId &&
    receipt.status === 'accepted';
  useEffect(() => {
    if (accepted && !awaitingPreparation && params.returnTo === 'recovery')
      router.dismissTo('/recovery');
  }, [accepted, awaitingPreparation, params.returnTo, router]);
  if (pendingDeletion) return <Redirect href="/delete-account" />;
  if (accepted && !awaitingPreparation)
    return params.returnTo === 'recovery' ? null : <Redirect href="/access" />;

  const accept = async () => {
    if (state.busy || !state.initialized || receipt.saving || accepted) return;
    if (creatingNew || !identity.getSnapshot().account) {
      // Identity owns persistence, network errors and exact-proof retries.
      await identity.createAcceptedAccount();
    } else await acceptance.accept();
  };
  const checking =
    !!state.account &&
    !creatingNew &&
    receipt.status === 'loading' &&
    !receipt.saving;
  return (
    <AcceptanceView
      busy={state.busy || receipt.saving || !state.initialized || accepted}
      checking={checking}
      busyLabel={
        accepted
          ? 'Preparing your challenges'
          : state.busy
            ? 'Creating your account'
            : 'Saving your acceptance'
      }
      error={
        linkError ||
        receipt.message ||
        (state.message === 'Your account has been deleted.' ||
        state.message === 'Your account is connected.'
          ? ''
          : state.message)
      }
      {...links}
      onAccept={() => {
        void accept();
      }}
    />
  );
}
