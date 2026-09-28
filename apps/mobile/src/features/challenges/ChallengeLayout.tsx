import type { PropsWithChildren } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader } from '../../components/ScreenHeader';
import { colors } from '../../theme/tokens';
import { challengeScale } from './challenge-design';

export function ChallengeLayout({
  title,
  children,
  insetTop = true,
  fillContent = false,
}: PropsWithChildren<{
  title: string;
  insetTop?: boolean;
  fillContent?: boolean;
}>) {
  const { width } = useWindowDimensions();
  const scale = challengeScale(width);
  return (
    <SafeAreaView
      testID="challenge-screen-surface"
      style={styles.safe}
      edges={insetTop ? ['top', 'left', 'right'] : ['left', 'right']}
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
          <ScreenHeader title={title} scale={scale} />
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
