import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { SettingsInformationGroups } from './information/SettingsInformationGroups';
import { SettingsPage } from '../../components/settings/SettingsPage';
import { SettingsMotionRow } from './SettingsMotionRow';
import { SettingsHapticsRow } from './SettingsHapticsRow';
import { SettingsExportRow } from './export/SettingsExportRow';
import {
  PendingSettingsRow,
  SettingsGroup,
  SettingsRowContent,
  SettingsActionRow,
} from '../../components/settings/SettingsRows';

export function SettingsScreen() {
  return (
    <SettingsPage title="Settings">
      <SettingsGroup title="Preferences">
        <SettingsHapticsRow />
        <SettingsMotionRow />
        {__DEV__ && (
          <SettingsActionRow
            icon="haptics"
            label="Test haptics"
            href="/preview?mode=haptics"
            chevron
          />
        )}
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
        <SettingsActionRow
          icon="delete"
          label="Delete account"
          href="/delete-account"
          chevron
        />
      </SettingsGroup>

      <SettingsGroup title="Privacy">
        <PendingSettingsRow icon="analytics" label="General analytics" />
        <PendingSettingsRow icon="sensitive" label="Sensitive metadata" />
      </SettingsGroup>

      <SettingsInformationGroups />
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.65 },
});
