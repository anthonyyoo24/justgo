import { Redirect } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useAccess, useIdentity } from '../providers/AppProvider';
import { NavigationLink, SettingsLink } from '../../components/NavigationLink';
import { colors, spacing, typography } from '../../theme/tokens';
import { useWelcomeTransition } from '../identity/welcome/WelcomeTransition';
import { AppLoadingScreen } from '../loading/AppLoadingScreen';
export function AccessScreen() {
  const identity = useIdentity();
  const access = useAccess();
  const awaitingWelcomeAccess = useWelcomeTransition();
  const localCollection = 'collectionId' in identity && !!identity.collectionId;
  if (identity.deletionStatus === 'deleted' || identity.needsWelcome)
    return <Redirect href="/welcome" />;
  if (
    identity.deletionStatus === 'pending' ||
    identity.deletionStatus === 'cleanup'
  )
    return <Redirect href="/delete-account" />;
  if (
    !identity.initialized ||
    (identity.busy && !identity.account && !localCollection)
  )
    return <AppLoadingScreen />;
  if (!identity.account && !localCollection)
    return <Redirect href="/recovery" />;
  if (awaitingWelcomeAccess) return <Redirect href="/acceptance" />;
  if (access.verified) return <Redirect href="/(tabs)" />;
  if (access.isPending) return <AppLoadingScreen />;
  return (
    <Screen title="JustGO" accessory={<SettingsLink />}>
      <View style={styles.hero}>
        <Text accessibilityRole="header" style={styles.title}>
          {access.data?.status === 'unpaid' && !access.isError
            ? 'Your next step awaits.'
            : 'We can’t verify access yet.'}
        </Text>
        <Text accessibilityLiveRegion="polite" style={styles.body}>
          {access.data?.status === 'unpaid' && !access.isError
            ? access.data.source === 'free_beta'
              ? 'This is a free test build. Your account needs current approval from the developer to start challenges. Contact support if you need access.'
              : 'An active subscription is needed to start challenges. Purchases aren’t available in this build yet.'
            : 'Please try again when connected. Saved history and Settings remain available on this phone.'}
        </Text>
        <PrimaryButton
          label="Check access again"
          onPress={() => {
            void access.refetch();
          }}
          busy={access.isFetching}
        />
        {localCollection && (
          <NavigationLink href="/(tabs)/progress">
            View saved history
          </NavigationLink>
        )}
        <NavigationLink href="/recovery">Account</NavigationLink>
        {__DEV__ && (
          <NavigationLink href="/preview">Preview app screens</NavigationLink>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flex: 1,
    gap: spacing.xl,
    justifyContent: 'center',
    paddingVertical: spacing.xl,
  },
  title: { ...typography.display, color: colors.ink, textAlign: 'center' },
  body: { ...typography.body, color: colors.ink },
});
