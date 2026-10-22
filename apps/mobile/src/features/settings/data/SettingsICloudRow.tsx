import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  useJournal,
  useRuntime,
} from '../../../app-support/providers/AppProvider';
import { SettingsToggleRow } from '../../../components/settings/SettingsToggleRow';
import { SettingsActionRow } from '../../../components/settings/SettingsRows';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import {
  iCloudSync,
  type ICloudStatus,
  ICloudError,
} from '../../../platform/icloud/icloud-sync';
import { useReduceMotion } from '../../../platform/motion/motion';
import { colors, spacing, typography } from '../../../theme/tokens';

const noSubscription = () => () => {};
const idle = { status: 'idle', error: null } as const;
const messageFor = (error: unknown) =>
  error instanceof ICloudError && error.code === 'QUOTA_EXCEEDED'
    ? 'iCloud storage is full. Your saved data remains on this phone.'
    : error instanceof ICloudError && error.code === 'ACCOUNT_CHANGED'
      ? 'Your iCloud account changed. Review your iCloud account and turn sync on again.'
      : 'Couldn’t finish iCloud sync. Your saved data remains on this phone. Please try again.';

export function SettingsICloudRow({
  disabled,
  onBusyChange,
}: {
  disabled: boolean;
  onBusyChange: (busy: boolean) => void;
}) {
  const { activity, client } = useRuntime();
  const repository = useJournal();
  const coordinator = activity.getICloudCoordinator();
  const state = useSyncExternalStore(
    coordinator?.store.subscribe ?? noSubscription,
    () => coordinator?.store.getState() ?? idle,
  );
  const reduceMotion = useReduceMotion();
  const [status, setStatus] = useState<ICloudStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryEnabled, setRetryEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void iCloudSync
        .status()
        .then((next) => {
          if (alive) setStatus(next);
        })
        .catch(() => {
          if (alive)
            setStatus({
              status: 'unavailable',
              enabled: false,
              accountToken: null,
            });
        });
    };
    refresh();
    const unsubscribe = iCloudSync.subscribe(refresh);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    onBusyChange(busy);
    return () => onBusyChange(false);
  }, [busy, onBusyChange]);
  const owner = repository?.accountId;
  const run = useCallback(
    async (enabled: boolean, acknowledgeReset = false) => {
      if (!owner || busy || disabled || !client.ownsCollection(owner)) return;
      setBusy(true);
      setError(null);
      setRetryEnabled(null);
      setConfirm(false);
      try {
        await iCloudSync.setEnabled(enabled);
        if (!client.ownsCollection(owner)) return;
        if (enabled) {
          if (!coordinator) throw new ICloudError('UNAVAILABLE');
          if (acknowledgeReset) await coordinator?.acknowledgeReset();
          else await coordinator?.synchronize();
        }
        if (client.ownsCollection(owner)) setStatus(await iCloudSync.status());
      } catch (failure) {
        if (client.ownsCollection(owner)) {
          setError(messageFor(failure));
          setRetryEnabled(enabled);
          try {
            setStatus(await iCloudSync.status());
          } catch {
            /* Keep the last known toggle while retry feedback is visible. */
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [owner, busy, disabled, client, coordinator],
  );
  const reset = state.error === 'RESET_CONFIRMATION_REQUIRED';
  const visibleError =
    error ??
    (state.status === 'error' && state.error && !reset
      ? messageFor(new ICloudError(state.error))
      : null);
  const unavailableReason =
    status && status.status !== 'available'
      ? unavailableMessages[status.status]
      : null;
  return (
    <View>
      <SettingsToggleRow
        icon="icloud"
        label="iCloud Sync"
        hint={
          status?.status === 'available'
            ? 'Sync your saved data with your private Apple iCloud account. JustGO sign-in is separate.'
            : 'iCloud Sync requires a configured iPhone build and an available iCloud account.'
        }
        value={status?.enabled ?? false}
        busy={busy || status === null || state.status === 'syncing'}
        disabled={disabled || busy || !owner || status?.status !== 'available'}
        reduceMotion={reduceMotion}
        onValueChange={(enabled) => {
          if (enabled) setConfirm(true);
          else void run(false);
        }}
      />
      {unavailableReason && (
        <Text accessibilityRole="alert" style={styles.unavailable}>
          {unavailableReason}
        </Text>
      )}
      {confirm && (
        <View accessibilityRole="alert" style={styles.inset}>
          <Text style={styles.body}>
            Sync your challenge history, feelings and reflections with your
            private iCloud account? This is separate from JustGO sign-in.
          </Text>
          <SettingsActionRow
            icon="account"
            label="Turn on iCloud Sync"
            disabled={disabled || busy}
            onPress={() => {
              void run(true);
            }}
          />
          <SettingsActionRow
            icon="account"
            label="Cancel"
            onPress={() => setConfirm(false)}
          />
        </View>
      )}
      {reset && (
        <View style={styles.inset}>
          <Text accessibilityRole="alert" style={styles.body}>
            Your saved data was deleted from iCloud on another device. Clear
            this phone’s older copy before syncing again.
          </Text>
          <SettingsActionRow
            icon="delete"
            label="Clear older copy and sync"
            disabled={disabled || busy}
            onPress={() => {
              void run(true, true);
            }}
          />
        </View>
      )}
      {visibleError && (
        <View style={styles.inset}>
          <Text accessibilityRole="alert" style={styles.error}>
            {visibleError}
          </Text>
          <SettingsActionRow
            icon="account"
            label="Retry iCloud Sync"
            disabled={disabled || busy}
            onPress={() => {
              if (retryEnabled !== false && !status?.enabled) {
                setError(null);
                setConfirm(true);
              } else void run(retryEnabled ?? true);
            }}
          />
        </View>
      )}
    </View>
  );
}
const unavailableMessages: Record<
  Exclude<ICloudStatus['status'], 'available'>,
  string
> = {
  not_configured: 'iCloud Sync is not set up in this version of JustGO yet.',
  unsupported: 'iCloud Sync is available on iPhone and iPad.',
  not_authenticated:
    'Sign in to iCloud in your device’s Settings to use iCloud Sync.',
  restricted: 'iCloud access is restricted on this device.',
  unavailable:
    'iCloud is unavailable right now. Your saved data stays on this phone.',
};
const styles = StyleSheet.create({
  unavailable: {
    ...typography.caption,
    color: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  inset: { padding: spacing.lg, gap: spacing.md },
  body: { ...typography.caption, color: colors.ink },
  error: { ...typography.caption, color: '#8B1E32' },
});
