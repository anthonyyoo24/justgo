import { Link } from 'expo-router';
import Constants from 'expo-constants';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, layout, spacing, typography } from '../../theme/tokens';
import { SettingsInformationGroups } from './information/SettingsInformationGroups';
import { SettingsPage } from '../../components/settings/SettingsPage';
import { SettingsMotionRow } from './SettingsMotionRow';
import { SettingsExportRow } from './export/SettingsExportRow';
import { useAccess } from '../providers/AppProvider';
import {
  PendingSettingsRow,
  SettingsGroup,
  SettingsRowContent,
} from '../../components/settings/SettingsRows';

export function SettingsScreen() {
  const access = useAccess();
  const version = Constants.expoConfig?.version;
  return (
    <SettingsPage title="Settings">
      <SettingsGroup title="Preferences">
        <PendingSettingsRow icon="haptics" label="Haptics" />
        <SettingsMotionRow />
      </SettingsGroup>

      <SettingsGroup title="Account & data">
        <Link href="/recovery" asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Account & recovery"
            style={({ pressed }) => pressed && styles.pressed}
          >
            <SettingsRowContent
              icon="account"
              label="Account & recovery"
              chevron
            />
          </Pressable>
        </Link>
        <SettingsExportRow />
        <PendingSettingsRow icon="delete" label="Delete account" />
      </SettingsGroup>

      <SettingsGroup title="Privacy">
        <PendingSettingsRow icon="analytics" label="General analytics" />
        <PendingSettingsRow icon="sensitive" label="Sensitive metadata" />
      </SettingsGroup>

      <SettingsInformationGroups />

      <Text style={styles.footer}>
        JustGO{version ? ` · Version ${version}` : ''}
        {access.data?.source === 'free_beta' ? '\nFree test build' : ''}
      </Text>
      {__DEV__ && (
        <Link href="/preview" style={styles.preview}>
          Preview app screens
        </Link>
      )}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.65 },
  footer: { ...typography.caption, color: colors.ink, textAlign: 'center' },
  preview: {
    ...typography.caption,
    color: colors.ink,
    textAlign: 'center',
    textDecorationLine: 'underline',
    minHeight: layout.minTouchTarget,
    paddingVertical: spacing.md,
  },
});
