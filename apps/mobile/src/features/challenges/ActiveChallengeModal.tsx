import { useRef } from 'react';
import { useModalIsolation } from '../../platform/useModalIsolation';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';
import { SavingSheetSurface } from '../../app-support/saving/SavingFeedback';
import { colors, typography } from '../../theme/tokens';
import { ChallengeLayout } from './ChallengeLayout';
import { ActiveChallenge } from './ActiveChallenge';
import type { ChallengeStart } from './controller';

type Props = {
  start: ChallengeStart;
  error: string;
  saving: boolean;
  completionStarted: boolean;
  completed: boolean;
  savingVisible: boolean;
  finish: (outcome: 'completed' | 'given_up') => Promise<void>;
};

/**
 * Present unfinished activity as an opaque surface with explicit outcome exits.
 * Root insets are captured before the shared-window iOS/web portal appears so its
 * first layout is stable; Android retains modal-owned safe-area measurement.
 */
export function ActiveChallengeModal(props: Props) {
  // The iOS/web full-screen portal shares the root window. Use its measured
  // insets on the first render; native SafeAreaView measures again after
  // presentation and briefly places the header beneath the status bar.
  const insets = useSafeAreaInsets();
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
      <ActiveChallengeContent {...props} insets={insets} />
    </Modal>
  );
}
/**
 * Mount the active surface inside the portal before applying web isolation.
 * The outer surface owns iOS/web padding, while Android keeps its existing edges;
 * inner layout must not apply the same root insets again.
 */
function ActiveChallengeContent({
  start,
  error,
  saving,
  completionStarted,
  completed,
  savingVisible,
  finish,
  insets,
}: Props & { insets: EdgeInsets }) {
  const surface = useRef<View>(null);
  // Android's default dialog can exclude system bars, unlike its root window.
  // Preserve its modal-owned inset measurement rather than padding twice.
  const android = Platform.OS === 'android';
  const Surface = android ? SafeAreaView : View;
  useModalIsolation(surface);
  return (
    <Surface
      testID="active-challenge-surface"
      ref={surface}
      style={[
        styles.surface,
        !android && {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
      {...(android ? { edges: ['bottom'] as const } : {})}
      accessibilityViewIsModal
    >
      <SavingSheetSurface navigationEnabled={false} />
      <ChallengeLayout
        title="Active challenge"
        showSettings={false}
        {...(!android ? { safeAreaEdges: [] } : {})}
      >
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
    </Surface>
  );
}
const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: colors.cream },
  error: { ...typography.body, color: colors.ink },
});
