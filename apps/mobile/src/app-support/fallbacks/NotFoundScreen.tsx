import { useRouter } from 'expo-router';
import { StyleSheet } from 'react-native';
import { PrimaryButton } from '../../components/PrimaryButton';
import { Screen } from '../../components/Screen';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import { colors, typography } from '../../theme/tokens';

/** Shown for links that match no route; `/` then routes by account and access. */
export function NotFoundScreen() {
  const router = useRouter();
  return (
    <Screen title="Page not found">
      <Text style={styles.body}>
        This link doesn’t open anything in JustGO.
      </Text>
      <PrimaryButton label="Go home" onPress={() => router.replace('/')} />
    </Screen>
  );
}
const styles = StyleSheet.create({
  body: { ...typography.body, color: colors.ink },
});
