import { useSyncExternalStore } from 'react';
import { Redirect, useRouter } from 'expo-router';
import type { IdentityController } from '../controller';
import { WelcomeView } from './WelcomeView';
import { useBeginWelcomeEntry } from './WelcomeTransition';

export function WelcomeScreen({
  controller,
}: {
  controller: IdentityController;
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
  return (
    <WelcomeView
      disabled={!state.initialized || state.busy}
      error={
        state.message === 'Your account has been deleted.' ? '' : state.message
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
