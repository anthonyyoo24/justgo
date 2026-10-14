import { useCallback, useRef, useState } from 'react';
import { Link, useFocusEffect } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import { Screen } from '../../components/Screen';
import { PrimaryButton } from '../../components/PrimaryButton';
import { useIdentity, useJournal, useRuntime } from '../providers/AppProvider';
import { useMotionPreferences } from '../../platform/motion';
import { saveExportFile } from '../../platform/export-file';
import { ApiError } from '../../lib/http';
import { collectExport } from './data-export';
import { colors, spacing, typography } from '../../theme/tokens';
import type { AccountRepository } from '../../data/activity/repository';

export function ExportDataScreen() {
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
  const { reduceMotion } = useMotionPreferences();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
    if (active.current || !repository || !accountId) return;
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
          ? 'Export cancelled. You can try again.'
          : result === 'downloaded'
            ? 'Your ZIP download has started.'
            : 'Your export was shared.',
      );
    } catch (error) {
      if (
        controller.signal.aborted ||
        !client.ownsAccount(repository.accountId)
      )
        return;
      setMessage(
        error instanceof ApiError && error.code === 'STORAGE'
          ? 'Some saved data on this phone could not be read. Try reopening the app before exporting.'
          : 'Your export could not be created. Check your connection and try again.',
      );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <Screen title="Export my data">
      <Text style={styles.copy}>
        Get a ZIP with a CSV you can open in a spreadsheet and a JSON copy of
        your saved data.
      </Text>
      <Text style={styles.copy}>
        Includes completed challenges, feelings, reflections and changes waiting
        to upload from this phone. An internet connection is needed to include
        your full saved history.
      </Text>
      <Text style={styles.copy}>
        This file contains your private reflections. Choose a safe place to save
        it. Exporting keeps your data in JustGO.
      </Text>
      {accountId && repository ? (
        <PrimaryButton
          label={busy ? 'Preparing export…' : 'Export ZIP'}
          busy={busy}
          onPress={() => {
            // This action owns failures and cancellation before updating its feedback.
            void start();
          }}
        />
      ) : (
        <Text style={styles.copy}>
          Connect to your account to export your data.
        </Text>
      )}
      {message && (
        <Text accessibilityRole="alert" style={styles.copy}>
          {message}
        </Text>
      )}
      <Link href="/settings" dismissTo style={styles.link}>
        Back to Settings
      </Link>
      {!accountId && (
        <Link href="/recovery" style={styles.link}>
          Account & recovery
        </Link>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  copy: { ...typography.body, color: colors.ink },
  link: {
    ...typography.label,
    color: colors.ink,
    paddingVertical: spacing.md,
    textDecorationLine: 'underline',
  },
});
