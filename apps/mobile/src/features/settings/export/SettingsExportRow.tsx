import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import {
  useIdentity,
  useJournal,
  useRuntime,
} from '../../../app-support/providers/AppProvider';
import { useMotionPreferences } from '../../../platform/motion/motion';
import { useHapticPreferences } from '../../../platform/haptics/haptics';
import { saveExportFile } from '../../../platform/export/export-file';
import { ApiError } from '../../../lib/network/http';
import { collectExport } from './data-export';
import { JournalBackupError } from '../../../data/backup/journal-backup';
import { colors, spacing, typography } from '../../../theme/tokens';
import type { AccountRepository } from '../../../data/activity/repository';
import { SettingsRowContent } from '../../../components/settings/SettingsRows';

type RowOptions = {
  disabled?: boolean;
  onBusyChange?: ((busy: boolean) => void) | undefined;
};
export function SettingsExportRow({
  disabled = false,
  onBusyChange,
}: RowOptions = {}) {
  const identity = useIdentity();
  const repository = useJournal();
  return (
    <ExportSession
      key={repository?.accountId ?? 'disconnected'}
      accountId={repository?.accountId ?? null}
      ownerKind={
        'collectionKind' in identity && identity.collectionKind === 'guest'
          ? 'guest'
          : 'account'
      }
      repository={repository}
      disabled={disabled}
      onBusyChange={onBusyChange}
    />
  );
}

function ExportSession({
  accountId,
  repository,
  ownerKind,
  disabled,
  onBusyChange,
}: {
  ownerKind: 'guest' | 'account';
  accountId: string | null;
  repository: AccountRepository | null;
  disabled: boolean;
  onBusyChange: ((busy: boolean) => void) | undefined;
}) {
  const { client } = useRuntime();
  const localAccountSnapshot =
    !!accountId && ownerKind === 'account' && !client.ownsAccount(accountId);
  const router = useRouter();
  const motion = useMotionPreferences();
  const reduceMotion = motion.requestedReduceMotion ?? motion.reduceMotion;
  const {
    enabled: haptics,
    loading: hapticsLoading,
    saving: hapticsSaving,
  } = useHapticPreferences();
  const preferencesPending =
    hapticsLoading || hapticsSaving || motion.loading || motion.saving;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    kind: 'success' | 'error';
  } | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  useFocusEffect(
    useCallback(
      () => () => {
        active.current?.abort();
        active.current = null;
        setBusy(false);
        setMessage(null);
      },
      [],
    ),
  );

  const start = async () => {
    if (active.current || preferencesPending || disabled) return;
    if (!repository || !accountId) {
      router.push('/recovery');
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setMessage(null);
    const check = () => {
      if (controller.signal.aborted) throw new ApiError('CANCELLED');
      if (!client.ownsCollection(repository.accountId))
        throw new ApiError('ACCOUNT_CHANGED');
    };
    try {
      const archive = await collectExport({
        client,
        repository,
        ownerKind,
        reduceMotion,
        haptics,
        signal: controller.signal,
      });
      check();
      const result = await saveExportFile(archive, check);
      check();
      setMessage(
        result === 'cancelled'
          ? null
          : {
              kind: 'success',
              text:
                result === 'downloaded'
                  ? localAccountSnapshot
                    ? 'Your phone’s saved data download has started. Sign in to include the latest cloud data.'
                    : 'Your ZIP download has started.'
                  : localAccountSnapshot
                    ? 'Your phone’s saved data was shared. Sign in to include the latest cloud data.'
                    : 'Your data download was shared.',
            },
      );
    } catch (error) {
      if (
        controller.signal.aborted ||
        !client.ownsCollection(repository.accountId)
      )
        return;
      setMessage({
        kind: 'error',
        text:
          error instanceof JournalBackupError
            ? error.message
            : error instanceof ApiError && error.code === 'STORAGE'
              ? 'Some saved data on this phone could not be read. Try reopening the app before exporting.'
              : 'Couldn’t download your data. Please try again.',
      });
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Download my data"
        accessibilityHint={
          accountId && repository
            ? localAccountSnapshot
              ? 'Save this phone’s challenge history, journal and preferences. Sign in to include the latest cloud data.'
              : 'Save your complete challenge history, journal and preferences in a restorable ZIP'
            : 'Continue on this phone before downloading your saved data'
        }
        accessibilityState={{
          disabled: busy || preferencesPending || disabled,
          busy: busy || preferencesPending,
        }}
        disabled={busy || preferencesPending || disabled}
        style={({ pressed }) => pressed && styles.pressed}
        onPress={() => {
          // This action handles export failures before presenting feedback.
          void start();
        }}
      >
        <SettingsRowContent
          icon="export"
          label="Download my data"
          accessory={
            busy ? (
              <ActivityIndicator
                color={colors.ink}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Download my data in progress"
              />
            ) : undefined
          }
        />
      </Pressable>
      {message && (
        <Text
          accessibilityRole="alert"
          style={[styles.message, message.kind === 'error' && styles.error]}
        >
          {message.text}
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  pressed: { opacity: 0.65 },
  message: {
    ...typography.caption,
    color: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  error: { color: '#8B1E32' },
});
