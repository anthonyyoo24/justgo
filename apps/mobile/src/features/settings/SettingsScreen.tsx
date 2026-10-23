import { SettingsInformationGroups } from './information/SettingsInformationGroups';
import { SettingsPage } from '../../components/settings/SettingsPage';
import { SettingsMotionRow } from './SettingsMotionRow';
import { SettingsHapticsRow } from './SettingsHapticsRow';
import {
  SettingsGroup,
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
            icon="help"
            label="Test error reporting"
            href="/preview?mode=diagnostics"
            chevron
          />
        )}
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
        <SettingsActionRow
          icon="account"
          label="Account"
          href="/recovery"
          chevron
        />
        <SettingsActionRow icon="export" label="Data" href="/data" chevron />
      </SettingsGroup>

      <SettingsInformationGroups />
    </SettingsPage>
  );
}
