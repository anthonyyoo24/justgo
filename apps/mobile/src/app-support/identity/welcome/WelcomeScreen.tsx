import { useSyncExternalStore } from 'react';
import { Redirect, useRouter } from 'expo-router';
import type { IdentityController } from '../controller';
import type { ManagedIdentityController } from '../auth/managed-controller';
import { ProviderButtons } from '../auth/ProviderButtons';
import { WelcomeView } from './WelcomeView';
import { useBeginWelcomeEntry } from './WelcomeTransition';

export function WelcomeScreen({
  controller,
}: {
  controller: IdentityController | ManagedIdentityController;
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
  if ('mode' in state && state.mode !== 'welcome' && !state.needsWelcome)
    return <Redirect href="/access" />;
  return (
    <WelcomeView
      disabled={!state.initialized || state.busy}
      error={
        state.message === 'Your account has been deleted.' ? '' : state.message
      }
      onRetry={
        'signIn' in controller
          ? () => {
              void controller.retry();
            }
          : undefined
      }
      signInButtons={
        'signIn' in controller ? (
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
        ) : undefined
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
