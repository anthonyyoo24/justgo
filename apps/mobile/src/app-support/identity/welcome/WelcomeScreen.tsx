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
  const signIn = useProviderSignIn(controller);
  const busyProvider =
    signIn.pendingProvider ??
    (state.account && !signIn.error ? (state.provider ?? 'apple') : null);
  const disabled =
    !state.initialized || state.busy || !!busyProvider || !!state.account;
  if (state.deletionStatus === 'pending' || state.deletionStatus === 'cleanup')
    return <Redirect href="/delete-account" />;
  if (signIn.destination) return <Redirect href={signIn.destination} />;
  if (!state.account && state.mode !== 'welcome' && !state.needsWelcome)
    return <Redirect href="/access" />;
  return (
    <WelcomeView
      disabled={disabled}
      error={
        signIn.error ||
        (signIn.attempted || state.message === 'Your account has been deleted.'
          ? ''
          : state.message)
      }
      connectionReference={signIn.error ? signIn.reference : null}
      onRetry={
        signIn.attempted
          ? undefined
          : () => {
              if (state.account) signIn.retry();
              else void controller.retry();
            }
      }
      signInButtons={
        <ProviderButtons
          provider={state.account ? (state.provider ?? 'apple') : undefined}
          disabled={!state.initialized || state.busy}
          busyProvider={busyProvider}
          retry={!!signIn.error && !!state.account}
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
