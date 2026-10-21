import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import {
  useIdentity,
  useActivityState,
  useJournal,
  useRuntime,
} from '../../../app-support/providers/AppProvider';
import { DestructiveConfirmation } from '../../../components/modals/DestructiveConfirmation';
import { SettingsPage } from '../../../components/settings/SettingsPage';
import {
  SettingsActionRow,
  SettingsRowDivider,
} from '../../../components/settings/SettingsRows';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import {
  readDataBackup,
  type RestorableData,
  type BackupOwner,
} from '../../../data/backup/data-backup';
import {
  JOURNAL_BACKUP_MAX_BYTES,
  JournalBackupError,
} from '../../../data/backup/journal-backup';
import { ApiError } from '../../../lib/network/http';
import { pickBackupFile } from '../../../platform/backup/backup-file';
import { useMotionPreferences } from '../../../platform/motion/motion';
import { useHapticPreferences } from '../../../platform/haptics/haptics';
import { colors, radii, spacing, typography } from '../../../theme/tokens';
import { SettingsExportRow } from '../export/SettingsExportRow';
import { SettingsICloudRow } from './SettingsICloudRow';
import { applyImportedPreferences } from './import-preferences';

type Action = 'download' | 'import' | 'delete' | 'icloud';
export function SettingsDataScreen() {
  const repository = useJournal();
  return <DataSession key={repository?.accountId ?? 'disconnected'} />;
}
function DataSession() {
  const { activity, client } = useRuntime();
  const repository = useJournal();
  const identity = useIdentity();
  const deletionPending =
    useActivityState().state?.dataDeletionPending ?? false;
  const motion = useMotionPreferences();
  const haptics = useHapticPreferences();
  const router = useRouter();
  const [busy, setBusy] = useState<Action | null>(null);
  const [preview, setPreview] = useState<RestorableData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const deleteConfirmation = useRef<number | null>(null);
  const confirmationSequence = useRef(0);
  const [message, setMessage] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);
  const owner: BackupOwner | null = repository
    ? {
        id: repository.accountId,
        kind:
          'collectionKind' in identity && identity.collectionKind === 'guest'
            ? 'guest'
            : 'account',
      }
    : null;
  const preferencesPending =
    motion.loading || motion.saving || haptics.loading || haptics.saving;
  const setDownloadBusy = useCallback(
    (value: boolean) =>
      setBusy((current) =>
        value ? 'download' : current === 'download' ? null : current,
      ),
    [],
  );
  const setICloudBusy = useCallback(
    (value: boolean) =>
      setBusy((current) =>
        value ? 'icloud' : current === 'icloud' ? null : current,
      ),
    [],
  );
  useFocusEffect(
    useCallback(
      () => () => {
        active.current?.abort();
        active.current = null;
        setBusy(null);
        setPreview(null);
        deleteConfirmation.current = null;
        setConfirmDelete(null);
        setMessage(null);
      },
      [],
    ),
  );
  const check = (controller: AbortController) => {
    if (controller.signal.aborted) throw new ApiError('CANCELLED');
    if (!owner || !client.ownsCollection(owner.id))
      throw new ApiError('ACCOUNT_CHANGED');
  };
  const chooseImport = async () => {
    if (busy || active.current || deletionPending) return;
    if (!owner) {
      router.push('/acceptance');
      return;
    }
    if (owner.kind === 'account' && !client.ownsAccount(owner.id)) {
      router.push({
        pathname: '/account/sign-in',
        params: { returnTo: 'data', ownerId: owner.id },
      });
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy('import');
    setMessage(null);
    setPreview(null);
    deleteConfirmation.current = null;
    setConfirmDelete(null);
    try {
      // No await before the picker: browser selection must retain this gesture.
      const bytes = await pickBackupFile(
        JOURNAL_BACKUP_MAX_BYTES,
        () => check(controller),
        controller.signal,
      );
      check(controller);
      if (bytes) setPreview(readDataBackup(bytes, owner));
    } catch (failure) {
      if (!controller.signal.aborted && client.ownsCollection(owner.id))
        setMessage(
          failure instanceof JournalBackupError
            ? failure.message
            : 'Couldn’t read this data file. Your saved data was kept.',
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(null);
      }
    }
  };
  const importData = async () => {
    if (
      !preview ||
      !owner ||
      busy ||
      active.current ||
      preferencesPending ||
      deletionPending
    )
      return;
    if (owner.kind === 'account' && !client.ownsAccount(owner.id)) {
      router.push({
        pathname: '/account/sign-in',
        params: { returnTo: 'data', ownerId: owner.id },
      });
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy('import');
    setMessage(null);
    let saved = false;
    try {
      check(controller);
      await activity.importData(preview);
      check(controller);
      saved = true;
      if (preview.preferences)
        await applyImportedPreferences(
          preview.preferences,
          { setReduced: motion.setReduced, setHaptics: haptics.setEnabled },
          () => check(controller),
        );
      check(controller);
      setPreview(null);
      setMessage(
        'Your data was imported. Existing differing journal entries were kept.',
      );
    } catch {
      if (!controller.signal.aborted && client.ownsCollection(owner.id))
        setMessage(
          saved
            ? 'Your saved data was imported, but preferences couldn’t finish saving. Import again to finish.'
            : 'Couldn’t finish importing. Your existing saved data was kept. Please try again.',
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(null);
      }
    }
  };
  const deleteData = async (confirmation: number) => {
    if (
      !owner ||
      busy ||
      active.current ||
      deleteConfirmation.current !== confirmation
    )
      return;
    if (owner.kind === 'account' && !client.ownsAccount(owner.id)) {
      deleteConfirmation.current = null;
      setConfirmDelete(null);
      router.push({
        pathname: '/account/sign-in',
        params: { returnTo: 'data', ownerId: owner.id },
      });
      return;
    }
    const controller = new AbortController();
    active.current = controller;
    setBusy('delete');
    setMessage(null);
    try {
      check(controller);
      await activity.deleteAllData();
      check(controller);
      deleteConfirmation.current = null;
      setConfirmDelete(null);
      setPreview(null);
      setMessage(
        'All saved data was deleted. Your account and downloaded files were kept.',
      );
    } catch {
      if (!controller.signal.aborted && client.ownsCollection(owner.id))
        setMessage(
          'Deletion is unfinished. Please try again to finish deleting your saved data.',
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(null);
      }
    }
  };
  return (
    <SettingsPage title="Data" backHref="/settings">
      <View style={styles.card}>
        <SettingsICloudRow
          disabled={deletionPending || (busy !== null && busy !== 'icloud')}
          onBusyChange={setICloudBusy}
        />
        <SettingsRowDivider />
        <SettingsExportRow
          disabled={deletionPending || (busy !== null && busy !== 'download')}
          onBusyChange={setDownloadBusy}
        />
        <SettingsRowDivider />
        <SettingsActionRow
          icon="import"
          label="Import data"
          disabled={busy !== null || deletionPending}
          busy={busy === 'import'}
          onPress={() => {
            void chooseImport();
          }}
        />
      </View>
      {preview && !deletionPending && (
        <View style={styles.preview} accessibilityRole="alert">
          <Text accessibilityRole="header" style={styles.heading}>
            Import this data?
          </Text>
          <Text style={styles.body}>
            {preview.legacyJournalOnly
              ? 'This older file contains journal entries only. Challenge history and preferences are not included.'
              : `${preview.attempts.length} saved challenges, ${preview.journal.entries.length} journal entries and your preferences.`}
          </Text>
          <Text style={styles.body}>
            Missing data will be added. Existing differing journal entries will
            be kept.
          </Text>
          <SettingsActionRow
            icon="account"
            label="Confirm import"
            disabled={busy !== null || preferencesPending}
            onPress={() => {
              void importData();
            }}
          />
          <SettingsActionRow
            icon="account"
            label="Cancel import"
            disabled={busy !== null}
            onPress={() => {
              setPreview(null);
              setMessage(null);
            }}
          />
        </View>
      )}
      {!confirmDelete && !!(message || deletionPending) && (
        <Text accessibilityRole="alert" style={styles.message}>
          {message ||
            'Deletion is unfinished. Select Delete all my data to resume.'}
        </Text>
      )}
      <View style={styles.delete}>
        <View style={styles.card}>
          <SettingsActionRow
            icon="delete"
            label="Delete all my data"
            destructive
            busy={busy === 'delete'}
            disabled={busy !== null}
            onPress={() => {
              const confirmation = ++confirmationSequence.current;
              deleteConfirmation.current = confirmation;
              setConfirmDelete(confirmation);
              setMessage(null);
            }}
          />
        </View>
      </View>
      {confirmDelete !== null && (
        <DestructiveConfirmation
          title={
            deletionPending && busy !== 'delete'
              ? 'Finish deleting saved data?'
              : 'Delete all saved data?'
          }
          message="Your challenge history, feelings and reflections on this phone, in your JustGO account and in associated iCloud copies will be deleted. Your account, login methods and downloaded files remain. This cannot be undone."
          confirmLabel="Delete"
          progressLabel="Deleting saved data"
          busy={busy === 'delete'}
          disabled={busy !== null}
          error={message}
          onCancel={() => {
            if (active.current || deleteConfirmation.current !== confirmDelete)
              return;
            deleteConfirmation.current = null;
            setConfirmDelete(null);
            setMessage(null);
          }}
          onConfirm={() => {
            // The operation keeps retry/error state and rechecks collection ownership.
            void deleteData(confirmDelete);
          }}
        />
      )}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  preview: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
  heading: { ...typography.heading, color: colors.ink },
  body: { ...typography.body, color: colors.ink },
  message: { ...typography.caption, color: colors.ink, padding: spacing.lg },
  delete: { marginTop: spacing.section, gap: spacing.lg },
});
