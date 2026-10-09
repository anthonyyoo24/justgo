import type { PropsWithChildren } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { colors } from '../../theme/tokens';
import { challengeScale } from './challenge-design';

/**
 * Lay out the challenge header and content with caller-controlled safe-area edges.
 * Pass an empty edge list when the parent already owns all inset padding.
 */
export function ChallengeLayout({
  title,
  children,
  insetTop = true,
  safeAreaEdges,
  fillContent = false,
  showSettings = true,
}: PropsWithChildren<{
  title: string;
  insetTop?: boolean;
  safeAreaEdges?: readonly Edge[];
  fillContent?: boolean;
  showSettings?: boolean;
}>) {
  const { width } = useWindowDimensions();
  const scale = challengeScale(width);
  return (
    <SafeAreaView
      testID="challenge-screen-surface"
      style={styles.safe}
      edges={
        safeAreaEdges ??
        (insetTop ? ['top', 'left', 'right'] : ['left', 'right'])
      }
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.content,
            fillContent && styles.fillContent,
            { paddingHorizontal: 14 * scale },
          ]}
        >
          <ScreenHeader
            title={title}
            scale={scale}
            showSettings={showSettings}
          />
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: 384,
    paddingTop: 4,
    paddingBottom: 16,
    gap: 12,
  },
  fillContent: { flexGrow: 1, paddingBottom: 0 },
});
