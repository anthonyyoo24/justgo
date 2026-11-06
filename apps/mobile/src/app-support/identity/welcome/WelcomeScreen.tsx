import { useSyncExternalStore } from 'react';
import { Redirect, useRouter } from 'expo-router';
import type { ManagedIdentityController } from '../auth/managed-controller';
import { ProviderButtons } from '../auth/ProviderButtons';
import { WelcomeView } from './WelcomeView';
import { useBeginWelcomeEntry } from './WelcomeTransition';
import { useProviderSignIn } from '../account/useProviderSignIn';

export function WelcomeScreen({
  controller,
}: {
  controller: ManagedIdentityController;
}) {
  const beginEntry = useBeginWelcomeEntry();
  const router = useRouter();
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const signIn = useProviderSignIn(controller, state);
  const disabled =
    !state.initialized ||
    state.busy ||
    !!signIn.busyProvider ||
    !!state.account;
  const connectionError =
    state.directSignInFailure ||
    state.message === 'Your account has been deleted.'
      ? ''
      : state.message;
  if (state.deletionStatus === 'pending' || state.deletionStatus === 'cleanup')
    return <Redirect href="/delete-account" />;
  if (signIn.destination) return <Redirect href={signIn.destination} />;
  if (!state.account && state.mode !== 'welcome' && !state.needsWelcome)
    return <Redirect href="/access" />;
  return (
    <WelcomeView
      disabled={disabled}
      error={signIn.error || connectionError}
      connectionReference={
        signIn.error
          ? signIn.reference
          : connectionError
            ? state.connectionReference
            : null
      }
      onRetry={
        state.account
          ? signIn.retry
          : !signIn.error && connectionError
            ? () => {
                void controller.retry();
              }
            : undefined
      }
      signInButtons={
        <ProviderButtons
          disabled={!state.initialized || state.busy || !!state.account}
          busyProvider={signIn.busyProvider}
          onSignIn={(provider) => {
            void signIn.signIn(provider);
          }}
        />
      }
      onContinue={() => {
        const current = controller.getSnapshot();
        if (!current.initialized || current.busy || current.account) return;
        beginEntry();
        router.push('/acceptance');
      }}
    />
  );
}
