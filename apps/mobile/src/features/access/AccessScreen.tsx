import { Link, Redirect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAccess, useIdentity } from '../shell/AppProvider';
import { SettingsLink, styles } from '../shell/ShellScreens';
export function AccessScreen() {
  const identity = useIdentity();
  const access = useAccess();
  if (!identity.initialized || (identity.busy && !identity.account))
    return (
      <Screen title="JustGO">
        <ActivityIndicator accessibilityLabel="Connecting your account" />
      </Screen>
    );
  if (!identity.account) return <Redirect href="/recovery" />;
  if (access.verified) return <Redirect href="/(tabs)" />;
  return (
    <Screen title="JustGO" accessory={<SettingsLink />}>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.title}>
          {access.isPending
            ? 'Checking your access…'
            : access.data?.status === 'unpaid' && !access.isError
              ? 'Your next step awaits.'
              : 'We can’t verify access yet.'}
        </Text>
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {access.isPending
            ? 'Your private account is connected.'
            : access.data?.status === 'unpaid' && !access.isError
              ? 'An active subscription is needed to start challenges. Purchases aren’t available in this build yet.'
              : 'Your account is connected. Please try again shortly. Your recovery options are always available.'}
        </Text>
        <PrimaryButton
          label="Check access again"
          onPress={() => {
            void access.refetch();
          }}
          busy={access.isFetching}
        />
        <Link href="/recovery" style={styles.link}>
          Account & recovery
        </Link>
        {__DEV__ && (
          <Link href="/preview" style={styles.link}>
            Preview app screens
          </Link>
        )}
      </View>
    </Screen>
  );
}
