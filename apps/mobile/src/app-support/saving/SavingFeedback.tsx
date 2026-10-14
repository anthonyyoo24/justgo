import { useEffect, useRef, type PropsWithChildren } from 'react';
import { View } from 'react-native';
import { useActivityState, useRuntime } from '../providers/AppProvider';
import {
  ToastHost,
  dismissActivityToasts,
  showRecoveryToast,
} from '../../platform/Toast';
import { SavingNotice } from './SavingNotice';

// Modal surfaces render their own notice/host above native presentation. Only
// the app shell observes recovery sequences, so a sheet cannot duplicate toasts.
export function SavingSheetSurface({
  onLeave,
  navigationEnabled = true,
  toastHostEnabled = true,
}: {
  onLeave?: () => void;
  navigationEnabled?: boolean;
  toastHostEnabled?: boolean;
}) {
  const { activity } = useRuntime();
  useEffect(() => {
    // A prepared native cover mirrors the notice while its destination owns
    // the channel. Removing that cover must not release the destination host.
    if (!toastHostEnabled) return;
    activity.setToastChannel('activity-sheet');
    return () => {
      activity.setToastChannel('activity');
    };
  }, [activity, toastHostEnabled]);
  return (
    <>
      <SavingNotice
        onNavigate={onLeave}
        navigationEnabled={navigationEnabled}
        toastChannel="activity-sheet"
      />
      {toastHostEnabled && <ToastHost channel="activity-sheet" />}
    </>
  );
}
export function SavingFeedbackShell({ children }: PropsWithChildren) {
  const { repository, state } = useActivityState();
  const { activity } = useRuntime();
  const seen = useRef({ repository, sequence: state?.recoverySequence ?? 0 });
  useEffect(() => {
    if (seen.current.repository !== repository) {
      dismissActivityToasts();
      seen.current = { repository, sequence: state?.recoverySequence ?? 0 };
      return;
    }
    const sequence = state?.recoverySequence ?? 0;
    if (repository && sequence > seen.current.sequence) {
      seen.current.sequence = sequence;
      showRecoveryToast(
        activity.toastChannel,
        `${repository.accountId}:${sequence}`,
      );
    }
  }, [repository, state?.recoverySequence, activity]);
  useEffect(() => dismissActivityToasts, []);
  return (
    <View style={{ flex: 1 }}>
      <SavingNotice />
      {children}
      <ToastHost channel="activity" />
    </View>
  );
}
