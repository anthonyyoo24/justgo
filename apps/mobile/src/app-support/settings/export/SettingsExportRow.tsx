import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import {
  useIdentity,
  useJournal,
  useRuntime,
} from '../../providers/AppProvider';
import { useMotionPreferences } from '../../../platform/motion/motion';
import { saveExportFile } from '../../../platform/export/export-file';
import { ApiError } from '../../../lib/http';
import { collectExport } from './data-export';
import { colors, spacing, typography } from '../../../theme/tokens';
import type { AccountRepository } from '../../../data/activity/repository';
import { SettingsRowContent } from '../../../components/settings/SettingsRows';

export function SettingsExportRow() {
  const { account } = useIdentity();
  const repository = useJournal();
  return (
    <ExportSession
      key={account?.userId ?? 'disconnected'}
      accountId={account?.userId ?? null}
      repository={repository}
    />
  );
}

function ExportSession({
  accountId,
  repository,
}: {
  accountId: string | null;
  repository: AccountRepository | null;
}) {
  const { client } = useRuntime();
  const router = useRouter();
  const { reduceMotion } = useMotionPreferences();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    kind: 'success' | 'error';
  } | null>(null);
  const active = useRef<AbortController | null>(null);
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
    if (active.current) return;
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
      if (!client.ownsAccount(repository.accountId))
        throw new ApiError('ACCOUNT_CHANGED');
    };
    try {
      const archive = await collectExport({
        client,
        repository,
        reduceMotion,
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
                  ? 'Your ZIP download has started.'
                  : 'Your export was shared.',
            },
      );
    } catch (error) {
      if (
        controller.signal.aborted ||
        !client.ownsAccount(repository.accountId)
      )
        return;
      setMessage({
        kind: 'error',
        text:
          error instanceof ApiError && error.code === 'STORAGE'
            ? 'Some saved data on this phone could not be read. Try reopening the app before exporting.'
            : 'Couldn’t export your data. Please try again.',
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
        accessibilityLabel="Export my data"
        accessibilityHint={
          accountId && repository
            ? 'Create a ZIP with your saved challenges, feelings and reflections'
            : 'Connect your account to export your data'
        }
        accessibilityState={{ disabled: busy, busy }}
        disabled={busy}
        style={({ pressed }) => pressed && styles.pressed}
        onPress={() => {
          // This action handles export failures before presenting feedback.
          void start();
        }}
      >
        <SettingsRowContent
          icon="export"
          label="Export my data"
          accessory={
            busy ? (
              <ActivityIndicator
                color={colors.ink}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel="Export my data in progress"
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
