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
export function SavingSheetSurface({ onLeave }: { onLeave?: () => void }) {
  const { activity } = useRuntime();
  useEffect(() => {
    activity.setToastChannel('activity-sheet');
    return () => {
      activity.setToastChannel('activity');
    };
  }, [activity]);
  return (
    <>
      <SavingNotice onNavigate={onLeave} />
      <ToastHost channel="activity-sheet" />
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
