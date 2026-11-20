import { useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ExternalLinkButton } from '../../components/ExternalLinkButton';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import { getLegalLinks } from '../../lib/legal-links';
import { colors, layout, spacing, typography } from '../../theme/tokens';
import { useRuntime } from '../providers/AppProvider';
import { PaywallNotice } from '../billing/PaywallNotice';
import type { Paywall, PaywallState } from '../billing/paywall';
import { useWelcomePreparation } from '../identity/welcome/welcome-preparation';

const idle: PaywallState = { status: 'idle' };
const noSubscription = () => () => {};
const working = new Set<PaywallState['status']>([
  'presenting',
  'restoring',
  'verifying',
]);

/**
 * The only screen an owner without verified access sees. The app opens on its
 * own once the API verifies a purchase, a restore or the signed-in account.
 */
export function LockedScreen() {
  const { paywall } = useRuntime();
  const router = useRouter();
  const preparation = useWelcomePreparation();
  const { active: preparing, markReady } = preparation;
  // A new owner's entry ends here when the app is locked, not on the deck.
  useEffect(() => {
    if (preparing) markReady();
  }, [preparing, markReady]);
  const state = usePaywallState(paywall);
  const busy = working.has(state.status);
  const legal = getLegalLinks();
  return (
    <Screen title="Subscribe to JustGO">
      <Text style={styles.body}>
        JustGO opens with a subscription. Subscribe, restore a purchase made
        with this Apple ID, or sign in to the account that paid.
      </Text>
      {paywall ? (
        <>
          <PaywallNotice paywall={paywall} />
          <PrimaryButton
            label="Subscribe"
            busy={state.status === 'presenting' || state.status === 'verifying'}
            disabled={busy}
            onPress={() => void paywall.open()}
          />
          <TextButton
            label="Restore purchase"
            disabled={busy}
            onPress={() => void paywall.restore()}
          />
        </>
      ) : (
        <Text accessibilityRole="alert" style={styles.body}>
          Subscriptions are available in the JustGO iPhone app.
        </Text>
      )}
      <TextButton
        label="Sign in"
        disabled={busy}
        onPress={() => router.push('/recovery')}
      />
      <View style={styles.legal}>
        <ExternalLinkButton
          label="Terms of Use"
          url={legal.terms}
          failureMessage="Couldn’t open the Terms of Use. Please try again."
          channel="activity"
        />
        <ExternalLinkButton
          label="Privacy Policy"
          url={legal.privacy}
          failureMessage="Couldn’t open the Privacy Policy. Please try again."
          channel="activity"
        />
      </View>
    </Screen>
  );
}

function usePaywallState(paywall: Paywall | null) {
  return useSyncExternalStore(
    paywall?.subscribe ?? noSubscription,
    paywall?.getSnapshot ?? (() => idle),
    paywall?.getSnapshot ?? (() => idle),
  );
}

function TextButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.textButton,
        (pressed || disabled) && styles.dimmed,
      ]}
    >
      <Text maxFontSizeMultiplier={2} style={styles.textButtonLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { ...typography.body, color: colors.ink },
  legal: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg },
  textButton: {
    minHeight: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButtonLabel: { ...typography.label, color: colors.ink },
  dimmed: { opacity: 0.6 },
});
