import { useSyncExternalStore } from 'react';
import { Redirect } from 'expo-router';
import type { IdentityController } from '../controller';
import { WelcomeView } from './WelcomeView';

export function WelcomeScreen({
  controller,
}: {
  controller: IdentityController;
}) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  if (state.deletionStatus === 'pending' || state.deletionStatus === 'cleanup')
    return <Redirect href="/delete-account" />;
  if (state.account) return <Redirect href="/" />;
  return (
    <WelcomeView
      busy={!state.initialized || state.busy}
      error={
        state.message === 'Your account has been deleted.' ? '' : state.message
      }
      onContinue={() => {
        const current = controller.getSnapshot();
        if (!current.initialized || current.busy) return;
        // The controller owns errors and persists the same proposal for uncertain retries.
        void (current.hasPending
          ? controller.retry()
          : controller.createAccount());
      }}
    />
  );
}
