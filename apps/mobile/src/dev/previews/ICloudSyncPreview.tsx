import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SettingsPage } from '../../components/settings/SettingsPage';
import { SettingsToggleRow } from '../../components/settings/SettingsToggleRow';
import {
  SettingsActionRow,
  SettingsRowDivider,
} from '../../components/settings/SettingsRows';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import { ICloudSyncSheet } from '../../features/settings/data/ICloudSyncSheet';
import { iCloudSyncMessages } from '../../features/settings/data/icloud-messages';
import { useReduceMotion } from '../../platform/motion/motion';
import { colors, radii, typography } from '../../theme/tokens';

/** Presentation only: never calls CloudKit, changes preferences or saves activity. */
export function ICloudSyncPreview({ state }: { state?: string }) {
  const reduceMotion = useReduceMotion();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(state === 'enabled');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewError = Object.entries(iCloudSyncMessages).find(
    ([key]) => key === (state === 'error' ? 'quota' : state),
  )?.[1];
  return (
    <SettingsPage title="Data" backHref="/settings">
      <Text style={styles.note}>SCREEN PREVIEW · No iCloud data is saved</Text>
      <View style={styles.card}>
        <SettingsToggleRow
          icon="icloud"
          label="iCloud Sync"
          hint="Preview the iCloud sync sheet without saving data."
          value={enabled}
          disabled={false}
          busy={false}
          reduceMotion={reduceMotion}
          onValueChange={(next) => {
            if (next) {
              setError(null);
              setOpen(true);
            } else setEnabled(false);
          }}
        />
        <SettingsRowDivider />
        <SettingsActionRow
          icon="export"
          label="Download my data"
          disabled
          onPress={() => {}}
        />
        <SettingsRowDivider />
        <SettingsActionRow
          icon="import"
          label="Import data"
          disabled
          onPress={() => {}}
        />
      </View>
      {open && (
        <ICloudSyncSheet
          busy={busy}
          disabled={false}
          error={error}
          reduceMotion={reduceMotion}
          onClose={() => setOpen(false)}
          onStart={() => {
            if (state === 'busy') setBusy(true);
            else if (previewError) setError(previewError);
            else {
              setEnabled(true);
              setOpen(false);
            }
          }}
        />
      )}
    </SettingsPage>
  );
}
const styles = StyleSheet.create({
  note: { ...typography.caption, color: colors.ink },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
});
