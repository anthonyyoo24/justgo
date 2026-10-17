import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView, type EdgeInsets } from 'react-native-safe-area-context';
import { useModalIsolation } from '../../../platform/modals/useModalIsolation';
import { SavingSheetSurface } from '../../../app-support/saving/SavingFeedback';
import { colors, typography } from '../../../theme/tokens';
import { ChallengeLayout } from '../ChallengeLayout';
import { ActiveChallenge } from './ActiveChallenge';
import type { ChallengeStart } from '../controller';

export type ActiveChallengeProps = {
  start: ChallengeStart;
  error: string;
  saving: boolean;
  completionStarted: boolean;
  completed: boolean;
  savingVisible: boolean;
  finish: (outcome: 'completed' | 'given_up') => Promise<void>;
};

/**
 * Share active content between the native challenge route and Android/web portals.
 * The outer surface owns iOS/web padding, while Android keeps its existing edges;
 * inner layout must not apply the same root insets again.
 */
export function ActiveChallengeContent({
  start,
  error,
  saving,
  completionStarted,
  completed,
  savingVisible,
  finish,
  insets,
  onVisualReady,
  toastHostEnabled = true,
}: ActiveChallengeProps & {
  insets: EdgeInsets;
  onVisualReady?: () => void;
  toastHostEnabled?: boolean;
}) {
  const [laidOut, setLaidOut] = useState(false);
  const [artworkSettled, setArtworkSettled] = useState(false);
  const [textureSettled, setTextureSettled] = useState(false);
  useEffect(() => {
    if (laidOut && artworkSettled && textureSettled) onVisualReady?.();
  }, [laidOut, artworkSettled, textureSettled, onVisualReady]);
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
      onLayout={onVisualReady ? () => setLaidOut(true) : undefined}
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
      <SavingSheetSurface
        navigationEnabled={false}
        toastHostEnabled={toastHostEnabled}
      />
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
          onArtworkSettled={
            onVisualReady ? () => setArtworkSettled(true) : undefined
          }
          onTextureSettled={
            onVisualReady ? () => setTextureSettled(true) : undefined
          }
        />
      </ChallengeLayout>
    </Surface>
  );
}
const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: colors.cream },
  error: { ...typography.body, color: colors.ink },
});
