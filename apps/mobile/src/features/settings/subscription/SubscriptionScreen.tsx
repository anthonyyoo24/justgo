import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import {
  SettingsActionRow,
  SettingsGroup,
  SettingsRowContent,
} from '../../../components/settings/SettingsRows';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { useRuntime } from '../../../app-support/providers/AppProvider';
import { PaywallNotice } from '../../../app-support/billing/PaywallNotice';
import type {
  Paywall,
  PaywallState,
} from '../../../app-support/billing/paywall';
import { openSubscriptionManagement } from '../../../platform/subscriptions/open-subscriptions';
import { showMessageToast } from '../../../platform/toast/Toast';
import { colors, spacing, typography } from '../../../theme/tokens';
import { useSubscription } from './use-subscription';

const idle: PaywallState = { status: 'idle' };
const noSubscription = () => () => {};
const working = new Set<PaywallState['status']>([
  'presenting',
  'restoring',
  'verifying',
]);

/** The saved plan, Apple's subscription page and a restore. */
export function SubscriptionScreen() {
  const { access, paywall } = useRuntime();
  const summary = useSubscription(access);
  const state = usePaywallState(paywall);
  const restoring = working.has(state.status);
  if (!summary)
    // Nothing links here without billing; a typed link says so and offers
    // no subscription actions.
    return (
      <SettingsPage title="Subscription">
        <SettingsGroup title="Plan">
          <SettingsRowContent
            icon="subscription"
            label="Subscriptions are off in this build"
          />
        </SettingsGroup>
      </SettingsPage>
    );
  return (
    <SettingsPage title="Subscription">
      <SettingsGroup title="Plan">
        <View
          accessible
          accessibilityLabel={[summary.plan, summary.note]
            .filter(Boolean)
            .join('. ')}
        >
          <SettingsRowContent
            icon="subscription"
            label={summary.plan}
            subtitle={summary.note}
          />
        </View>
      </SettingsGroup>
      <SettingsGroup title="Manage">
        <ManageSubscriptionRow />
        {paywall && (
          <SettingsActionRow
            icon="import"
            label="Restore Purchases"
            busy={restoring}
            onPress={() => {
              // The paywall owns the outcome and shows it in its notice.
              void paywall.restore();
            }}
          />
        )}
      </SettingsGroup>
      {paywall ? (
        <PaywallNotice paywall={paywall} />
      ) : (
        <Text style={styles.body}>
          Restoring a purchase is available in the JustGO iPhone app.
        </Text>
      )}
      <Text style={styles.body}>
        Apple bills and renews the subscription. Deleting your JustGO account
        does not cancel it.
      </Text>
    </SettingsPage>
  );
}

function ManageSubscriptionRow() {
  const opening = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const open = async () => {
    if (opening.current) return;
    opening.current = true;
    setBusy(true);
    try {
      await openSubscriptionManagement();
    } catch {
      // StoreKit's reason stays private.
      if (mounted.current)
        showMessageToast(
          'activity',
          'Couldn’t open subscription settings. Please try again.',
        );
    } finally {
      opening.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <SettingsActionRow
      icon="subscription"
      label="Manage Subscription"
      busy={busy}
      chevron
      onPress={() => {
        void open();
      }}
    />
  );
}

function usePaywallState(paywall: Paywall | null) {
  return useSyncExternalStore(
    paywall?.subscribe ?? noSubscription,
    paywall?.getSnapshot ?? (() => idle),
    paywall?.getSnapshot ?? (() => idle),
  );
}

const styles = StyleSheet.create({
  body: {
    ...typography.caption,
    color: colors.ink,
    paddingHorizontal: spacing.xs,
  },
});
