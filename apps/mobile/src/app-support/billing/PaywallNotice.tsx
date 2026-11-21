import { useSyncExternalStore } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { PrimaryButton } from '../../components/PrimaryButton';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import { colors, layout, radii, spacing, typography } from '../../theme/tokens';
import type { Paywall, PaywallState } from './paywall';

type Notice = {
  message: string;
  retry?: string;
  busy?: boolean;
  closable?: boolean;
};

const notices: Record<
  Exclude<PaywallState['status'], 'idle' | 'presenting'>,
  (state: PaywallState) => Notice
> = {
  // Apple can ask for a sign-in during a restore, so it can be closed.
  restoring: () => ({
    message: 'Restoring your purchase.',
    busy: true,
    closable: true,
  }),
  verifying: () => ({ message: 'Confirming your purchase.', busy: true }),
  pending: (state) =>
    state.status === 'pending' && state.awaiting === 'approval'
      ? {
          message:
            'Your purchase is waiting for approval. JustGO opens once it is approved.',
        }
      : {
          message:
            'We could not confirm your purchase yet. JustGO opens as soon as it is confirmed.',
          retry: 'Check again',
        },
  refused: () => ({
    message:
      'We could not verify this purchase, so JustGO stays locked. Subscribe or restore a purchase to try again.',
  }),
  failed: () => ({
    message: 'The purchase did not finish, so nothing changed.',
  }),
  unrestored: () => ({
    message:
      'No purchase to restore was found for this Apple ID. Subscribe, or sign in to the account that paid.',
  }),
  verified: () => ({ message: 'Your purchase is confirmed.' }),
};

/** The paywall's progress after Superwall's sheet closes or a restore starts. */
export function PaywallNotice({
  paywall,
}: {
  paywall: Pick<Paywall, 'subscribe' | 'getSnapshot' | 'retry' | 'dismiss'>;
}) {
  const state = useSyncExternalStore(
    paywall.subscribe,
    paywall.getSnapshot,
    paywall.getSnapshot,
  );
  if (state.status === 'idle' || state.status === 'presenting') return null;
  const notice = notices[state.status](state);
  return (
    <View style={styles.notice}>
      <View style={styles.row}>
        {notice.busy && <ActivityIndicator color={colors.ink} />}
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.body}
        >
          {notice.message}
        </Text>
      </View>
      {notice.retry && (
        <PrimaryButton
          label={notice.retry}
          onPress={() => void paywall.retry()}
        />
      )}
      {(!notice.busy || notice.closable) && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={paywall.dismiss}
          style={({ pressed }) => [styles.close, pressed && styles.pressed]}
        >
          <Text style={styles.closeLabel}>Close</Text>
        </Pressable>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  notice: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.peach,
  },
  row: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  body: { ...typography.body, color: colors.ink, flexShrink: 1 },
  close: {
    alignSelf: 'center',
    justifyContent: 'center',
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.lg,
  },
  pressed: { opacity: 0.6 },
  closeLabel: { ...typography.label, color: colors.ink },
});
