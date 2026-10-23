import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import {
  useJournal,
  useRuntime,
} from '../../../app-support/providers/AppProvider';
import { SettingsToggleRow } from '../../../components/settings/SettingsToggleRow';
import { SettingsRowContent } from '../../../components/settings/SettingsRows';
import {
  iCloudSync,
  type ICloudStatus,
  ICloudError,
} from '../../../platform/icloud/icloud-sync';
import { useReduceMotion } from '../../../platform/motion/motion';
import { colors } from '../../../theme/tokens';
import { ICloudSyncSheet } from './ICloudSyncSheet';
import { iCloudSyncMessages } from './icloud-messages';

const noSubscription = () => () => {};
const idle = { status: 'idle', error: null } as const;
const messageFor = (error: unknown) =>
  error instanceof ICloudError && error.code === 'QUOTA_EXCEEDED'
    ? iCloudSyncMessages.quota
    : error instanceof ICloudError && error.code === 'NOT_CONFIGURED'
      ? iCloudSyncMessages.update
      : error instanceof ICloudError && error.code === 'ACCOUNT_CHANGED'
        ? iCloudSyncMessages.accountChanged
        : iCloudSyncMessages.failed;

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
  const running = useRef(false);
  const visit = useRef<{
    owner: string | undefined;
    accountToken: string | null | undefined;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryDisable, setRetryDisable] = useState(false);
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
  useFocusEffect(
    useCallback(() => {
      // Consent and feedback belong to this visit, collection and Apple account.
      visit.current = { owner, accountToken: status?.accountToken };
      setConfirm(false);
      setError(null);
      setRetryDisable(false);
      return () => {
        visit.current = null;
        setConfirm(false);
      };
    }, [owner, status?.accountToken]),
  );
  const run = useCallback(
    async (enabled: boolean) => {
      const submittedVisit = visit.current;
      if (
        !owner ||
        !submittedVisit ||
        running.current ||
        disabled ||
        !client.ownsCollection(owner)
      )
        return;
      running.current = true;
      setBusy(true);
      setError(null);
      try {
        if (enabled) {
          const isCurrent = () =>
            client.ownsCollection(owner) && submittedVisit === visit.current;
          await iCloudSync.setEnabled(
            true,
            async () => {
              const checkVisit = () => {
                if (!isCurrent()) throw new ICloudError('DISABLED');
              };
              checkVisit();
              if (!coordinator) throw new ICloudError('UNAVAILABLE');
              await coordinator.synchronize();
              checkVisit();
            },
            isCurrent,
          );
        } else await iCloudSync.setEnabled(false);
        const next = await iCloudSync.status();
        if (client.ownsCollection(owner) && submittedVisit === visit.current) {
          setStatus(next);
          setConfirm(false);
        }
      } catch (failure) {
        if (client.ownsCollection(owner) && submittedVisit === visit.current) {
          setError(messageFor(failure));
          setRetryDisable(!enabled);
          setConfirm(true);
          try {
            const next = await iCloudSync.status();
            if (
              client.ownsCollection(owner) &&
              submittedVisit === visit.current
            )
              setStatus(next);
          } catch {
            /* Keep the last known toggle while retry feedback is visible. */
          }
        }
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [owner, disabled, client, coordinator],
  );
  const visibleError =
    error ??
    (state.status === 'error' && state.error
      ? messageFor(new ICloudError(state.error))
      : null);
  const unavailableReason =
    status && status.status !== 'available'
      ? iCloudSyncMessages[status.status]
      : null;
  return (
    <View>
      {status === null ? (
        <SettingsRowContent
          icon="icloud"
          label="iCloud Sync"
          accessory={
            <ActivityIndicator
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Loading iCloud Sync"
              color={colors.ink}
              style={styles.loadingAccessory}
            />
          }
        />
      ) : (
        <SettingsToggleRow
          icon="icloud"
          label="iCloud Sync"
          hint={
            status.status === 'available'
              ? 'Sync your saved data with your private Apple iCloud account. JustGO sign-in is separate.'
              : 'iCloud Sync requires a configured iPhone build and an available iCloud account.'
          }
          value={status.enabled && (!confirm || retryDisable)}
          busy={busy || state.status === 'syncing'}
          disabled={disabled || busy || !owner}
          reduceMotion={reduceMotion}
          onValueChange={(enabled) => {
            if (enabled) {
              if (retryDisable) setError(null);
              setRetryDisable(false);
              setConfirm(true);
            } else void run(false);
          }}
        />
      )}
      {confirm && !disabled && (
        <ICloudSyncSheet
          busy={busy}
          disabled={disabled || !owner || status?.status !== 'available'}
          error={unavailableReason ?? visibleError}
          actionLabel={retryDisable ? 'Try Again' : 'Start Syncing'}
          reduceMotion={reduceMotion}
          onClose={() => setConfirm(false)}
          onStart={() => {
            // run owns and presents any sync failure without dropping local data.
            void run(!retryDisable);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingAccessory: { width: 51, height: 31 },
});
