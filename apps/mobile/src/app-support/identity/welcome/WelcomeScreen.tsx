import { useSyncExternalStore } from 'react';
import { Redirect, useRouter } from 'expo-router';
import type { ManagedIdentityController } from '../auth/managed-controller';
import { ProviderButtons } from '../auth/ProviderButtons';
import { WelcomeView } from './WelcomeView';
import { useBeginWelcomeEntry } from './WelcomeTransition';

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
  if (state.deletionStatus === 'pending' || state.deletionStatus === 'cleanup')
    return <Redirect href="/delete-account" />;
  if (state.account) return <Redirect href="/access" />;
  if (state.mode !== 'welcome' && !state.needsWelcome)
    return <Redirect href="/access" />;
  return (
    <WelcomeView
      disabled={!state.initialized || state.busy}
      error={
        state.message === 'Your account has been deleted.' ? '' : state.message
      }
      onRetry={() => {
        void controller.retry();
      }}
      signInButtons={
        <ProviderButtons
          disabled={!state.initialized || state.busy}
          onSignIn={(provider) => {
            beginEntry();
            router.push({
              pathname: '/account/sign-in',
              params: { provider },
            });
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
