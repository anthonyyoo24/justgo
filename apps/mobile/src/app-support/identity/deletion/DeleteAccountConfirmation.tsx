import { useState } from 'react';
import { ConfirmationModal } from '../../../components/modals/ConfirmationModal';

type ConfirmationProps = {
  busy: boolean;
  error: string | null;
  cleanup: boolean;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteAccountConfirmation({
  cleanup,
  ...props
}: ConfirmationProps) {
  const [cleanupInstructions, setCleanupInstructions] = useState(cleanup);
  // Keep the warning steady during an attempt, and the cleanup explanation
  // steady during a retry. The durable deletion workflow owns this state.
  if (!props.busy && cleanupInstructions !== cleanup)
    setCleanupInstructions(cleanup);
  return (
    <ConfirmationModal
      {...props}
      destructive
      title="Delete your account?"
      message={
        cleanupInstructions
          ? 'Your account has been deleted. Finish clearing this phone’s account data and sign-in credentials.'
          : 'Your account, progress and journal on this phone, in JustGO’s cloud and in associated iCloud copies will be permanently deleted. Downloaded files you saved elsewhere remain under your control.\n\nDeleting your account does not cancel an App Store subscription. Manage subscriptions separately in your device’s Settings.'
      }
      confirmLabel="Delete"
      progressLabel="Deleting account"
    />
  );
}
