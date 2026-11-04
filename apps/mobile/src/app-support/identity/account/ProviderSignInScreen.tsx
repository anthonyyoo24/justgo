import { Redirect, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { z } from 'zod';
import { useIdentity, useRuntime } from '../../providers/AppProvider';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import { colors, spacing, typography } from '../../../theme/tokens';
import { useAcceptanceLinks } from '../../acceptance/useAcceptanceLinks';
import { ProviderButtons } from '../auth/ProviderButtons';
import { useProviderSignIn } from './useProviderSignIn';

export function ProviderSignInScreen() {
  const { identity } = useRuntime();
  const state = useIdentity();
  const params = useLocalSearchParams<{
    provider?: string;
    returnTo?: string;
    ownerId?: string;
  }>();
  const parsedOwner = z.uuid().safeParse(params.ownerId);
  const expectedOwnerId = parsedOwner.success ? parsedOwner.data : undefined;
  const returnToData = params.returnTo === 'data';
  const links = useAcceptanceLinks();
  const provider =
    params.provider === 'apple' || params.provider === 'google'
      ? params.provider
      : undefined;
  const signIn = useProviderSignIn(
    'signIn' in identity ? identity : null,
    'directSignInFailure' in state ? state : null,
    {
      provider,
      expectedOwnerId,
      returnToData,
      clearLinkError: links.clearLinkError,
    },
  );
  if (!('signIn' in identity)) return <Redirect href="/recovery" />;
  if (signIn.destination) return <Redirect href={signIn.destination} />;
  const guest = 'collectionKind' in state && state.collectionKind === 'guest';
  return (
    <SettingsPage
      title="Sign in"
      backHref={state.needsWelcome ? '/welcome' : '/recovery'}
    >
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Keep your data with your account
        </Text>
        <Text style={styles.body}>
          Signing in saves your challenge history, feelings and reflections to
          JustGO’s cloud service so they can sync across your signed-in devices.
        </Text>
        {guest ? (
          <Text style={styles.body}>
            Your saved entries on this phone will be included. You’ll keep the
            same journal when you sign in or log out.
          </Text>
        ) : (
          <Text style={styles.body}>
            {expectedOwnerId
              ? 'Sign in to the account that owns this phone’s saved data to continue.'
              : 'Sign back in to sync your saved entries. Choosing a different account opens that account’s journal and keeps the previous account’s entries on this phone.'}
          </Text>
        )}
        <ProviderButtons
          provider={provider}
          disabled={state.busy || !state.initialized}
          busyProvider={signIn.busyProvider}
          retry={signIn.retryHandoff}
          onSignIn={(selected) => {
            void signIn.signIn(selected);
          }}
        />
        {!!(signIn.error || links.linkError) && (
          <Text accessibilityRole="alert" style={styles.error}>
            {links.linkError || signIn.error}
          </Text>
        )}
        {__DEV__ && !!signIn.error && !!signIn.reference && (
          <Text selectable style={styles.error}>
            {signIn.reference}
          </Text>
        )}
        <View style={styles.links}>
          <Text
            accessibilityRole="link"
            onPress={links.onOpenTerms}
            style={styles.link}
          >
            Terms of Service
          </Text>
          <Text
            accessibilityRole="link"
            onPress={links.onOpenPrivacy}
            style={styles.link}
          >
            Privacy Policy
          </Text>
        </View>
      </View>
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  content: { padding: spacing.xl, gap: spacing.xl },
  title: { ...typography.heading, color: colors.ink },
  body: { ...typography.body, color: colors.ink },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  link: {
    ...typography.caption,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  error: { ...typography.caption, color: '#8B1E32' },
});
