import type { ErrorBoundaryProps } from 'expo-router';
import { StyleSheet } from 'react-native';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import { colors, typography } from '../../theme/tokens';

/**
 * The root layout's error boundary. It replaces the whole layout, so it renders
 * outside the app providers and must not use their context. The error's message
 * is not shown because it can contain user-entered text.
 */
export function RouteErrorScreen({ retry }: ErrorBoundaryProps) {
  return (
    <Screen title="Something went wrong">
      <Text accessibilityRole="alert" style={styles.body}>
        JustGO couldn’t show this screen. Try again, or close and reopen the
        app.
      </Text>
      {/* retry() only clears the boundary and re-renders; it cannot reject. */}
      <PrimaryButton label="Try again" onPress={() => void retry()} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  body: { ...typography.body, color: colors.ink },
});
