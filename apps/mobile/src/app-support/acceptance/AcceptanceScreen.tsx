import { Redirect } from 'expo-router';
import { useIdentity, useRuntime } from '../providers/AppProvider';
import { AcceptanceView } from './AcceptanceView';
import { useAcceptanceLinks } from './useAcceptanceLinks';
import { useWelcomeTransition } from '../identity/welcome/WelcomeTransition';

/** Continuing creates only a local guest collection; sign-in is a separate flow. */
export function AcceptanceScreen() {
  const { identity } = useRuntime();
  const state = useIdentity();
  const { linkError, clearLinkError, ...links } = useAcceptanceLinks();
  const awaitingPreparation = useWelcomeTransition();
  if (state.deletionStatus === 'pending' || state.deletionStatus === 'cleanup')
    return <Redirect href="/delete-account" />;
  const entered = !state.needsWelcome && state.deletionStatus !== 'deleted';
  if (entered && !awaitingPreparation) return <Redirect href="/access" />;
  return (
    <AcceptanceView
      busy={state.busy || !state.initialized || entered}
      error={
        linkError ||
        (state.message === 'Your account has been deleted.'
          ? ''
          : state.message)
      }
      {...links}
      onContinue={() => {
        clearLinkError();
        if (!state.busy && state.initialized) void identity.continueAsGuest();
      }}
    />
  );
}
