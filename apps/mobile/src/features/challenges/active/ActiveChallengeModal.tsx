import { useRef } from 'react';
import { useModalIsolation } from '../../../platform/modals/useModalIsolation';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SavingSheetSurface } from '../../../app-support/saving/SavingFeedback';
import { colors, typography } from '../../../theme/tokens';
import { ChallengeLayout } from '../ChallengeLayout';
import { ActiveChallenge } from './ActiveChallenge';
import type { ChallengeStart } from '../controller';

type Props = {
  start: ChallengeStart;
  error: string;
  saving: boolean;
  completionStarted: boolean;
  completed: boolean;
  savingVisible: boolean;
  finish: (outcome: 'completed' | 'given_up') => Promise<void>;
};

export function ActiveChallengeModal(props: Props) {
  return (
    <Modal
      testID="active-challenge-modal"
      visible
      // Keep the native stack mounted while Success opens behind this opaque surface.
      presentationStyle="overFullScreen"
      transparent={false}
      animationType="none"
      allowSwipeDismissal={false}
      // An unfinished challenge exits only through the explicit outcome controls.
      onRequestClose={() => {}}
    >
      <ActiveChallengeContent {...props} />
    </Modal>
  );
}
// Mounted inside the portal, so the web surface exists before isolation runs.
function ActiveChallengeContent({
  start,
  error,
  saving,
  completionStarted,
  completed,
  savingVisible,
  finish,
}: Props) {
  const surface = useRef<View>(null);
  useModalIsolation(surface);
  return (
    <SafeAreaView
      ref={surface}
      style={styles.surface}
      edges={['bottom']}
      accessibilityViewIsModal
    >
      <SavingSheetSurface navigationEnabled={false} />
      <ChallengeLayout title="Active challenge" showSettings={false}>
        {!!error && (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        )}
        <ActiveChallenge
          attempt={start}
          turn={start.turn}
          disabled={saving || completed}
          giveUpDisabled={saving || completionStarted || completed}
          savingVisible={savingVisible}
          finish={finish}
        />
      </ChallengeLayout>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: colors.cream },
  error: { ...typography.body, color: colors.ink },
});
