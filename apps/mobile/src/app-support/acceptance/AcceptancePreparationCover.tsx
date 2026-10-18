import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRuntime } from '../providers/AppProvider';
import { useModalIsolation } from '../../platform/modals/useModalIsolation';
import { AcceptanceView } from './AcceptanceView';
import { useAcceptanceLinks } from './useAcceptanceLinks';

export function AcceptancePreparationCover({
  preparing,
  attempt,
  onShow,
  onRetry,
}: {
  preparing: boolean;
  attempt: number;
  onShow: () => void;
  onRetry: () => void;
}) {
  // Read the root's measured insets before presenting the native modal.
  const insets = useSafeAreaInsets();
  const { linkError, ...links } = useAcceptanceLinks();
  const { challenges } = useRuntime();
  const state = useSyncExternalStore(
    challenges.subscribe,
    challenges.getSnapshot,
    challenges.getSnapshot,
  );
  const [timedOutAttempt, setTimedOutAttempt] = useState<number | null>(null);
  const surface = useRef<View>(null);
  useModalIsolation(surface);
  useEffect(() => {
    if (!preparing) return;
    const timer = setTimeout(() => setTimedOutAttempt(attempt), 15_000);
    return () => clearTimeout(timer);
  }, [preparing, attempt]);
  const error =
    preparing && !state.loading
      ? (!state.queues[state.selected] && state.error) ||
        (timedOutAttempt === attempt
          ? 'Your challenges are taking longer to prepare. Please try again.'
          : '')
      : '';

  return (
    <Modal
      visible
      animationType="none"
      presentationStyle="fullScreen"
      onShow={onShow}
      onRequestClose={() => undefined}
    >
      <View
        ref={surface}
        style={styles.surface}
        accessibilityViewIsModal
        testID="acceptance-preparation-cover"
      >
        <AcceptanceView
          insets={insets}
          busy={!error}
          error={linkError || error}
          busyLabel={
            preparing ? 'Preparing your challenges' : 'Checking your access'
          }
          actionLabel={error ? 'Try again' : 'I Accept'}
          onAccept={onRetry}
          {...links}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: '#FBF7EF' },
});
