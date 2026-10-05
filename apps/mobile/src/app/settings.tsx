import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../components/Screen';
import { NavigationLink } from '../components/NavigationLink';
import { useIdentity } from '../app-support/providers/AppProvider';
import { colors, radii, spacing, typography } from '../theme/tokens';
export default function SettingsRoute() {
  const { account } = useIdentity();
  return (
    <Screen title="Settings">
      <View style={styles.panel}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          Your private account
        </Text>
        <Text style={styles.body}>
          {account
            ? 'Connected securely. No email or password needed.'
            : 'Connect or recover your account to continue.'}
        </Text>
        <NavigationLink href="/recovery">Account & recovery</NavigationLink>
      </View>
      <Text style={styles.body}>
        Optional analytics are off. No activity is sent to an analytics service.
      </Text>
      <NavigationLink href="/" replace>
        Back to app
      </NavigationLink>
      {__DEV__ && (
        <NavigationLink href="/preview">Preview app screens</NavigationLink>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.lg,
    backgroundColor: colors.cream,
  },
  cardTitle: { ...typography.heading, color: colors.ink },
  body: { ...typography.body, color: colors.ink },
});
