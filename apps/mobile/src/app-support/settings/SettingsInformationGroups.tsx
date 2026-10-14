import { StyleSheet } from 'react-native';
import { ExternalLinkButton } from '../../components/ExternalLinkButton';
import {
  contactFailureMessage,
  featureRequestContact,
  supportContact,
} from '../contact';
import { getCommunityLinks } from './community-links';
import { getLegalLinks } from './legal-links';
import type { SettingsIconName } from './SettingsIcon';
import { SettingsGroup, SettingsRowContent } from './SettingsRows';

type SettingsLinkAction = {
  label: string;
  icon: SettingsIconName;
  url: string | null;
  failureMessage: string;
};

export function SettingsInformationGroups() {
  const legal = getLegalLinks();
  const community = getCommunityLinks();
  const supportActions: SettingsLinkAction[] = [
    {
      label: 'Get help',
      icon: 'help',
      url: supportContact,
      failureMessage: contactFailureMessage,
    },
    {
      label: 'Suggest a feature',
      icon: 'idea',
      url: featureRequestContact,
      failureMessage: contactFailureMessage,
    },
  ];
  const aboutActions: SettingsLinkAction[] = [
    {
      label: 'Rate on the App Store',
      icon: 'rate',
      url: community.rate,
      failureMessage: 'Couldn’t open the App Store. Please try again.',
    },
    ...(
      [
        ['Instagram', 'instagram'],
        ['TikTok', 'tiktok'],
        ['Twitter / X', 'twitter'],
      ] as const
    ).map(([label, icon]) => ({
      label,
      icon,
      url: community[icon],
      failureMessage: `Couldn’t open ${label}. Please try again.`,
    })),
    {
      label: 'Privacy policy',
      icon: 'privacy',
      url: legal.privacy,
      failureMessage: 'Couldn’t open the Privacy Policy. Please try again.',
    },
    {
      label: 'Terms of use',
      icon: 'terms',
      url: legal.terms,
      failureMessage: 'Couldn’t open the Terms of Use. Please try again.',
    },
  ];
  return (
    <>
      <SettingsGroup title="Support">
        {supportActions.map(renderLinkAction)}
      </SettingsGroup>
      <SettingsGroup title="About">
        {aboutActions.map(renderLinkAction)}
      </SettingsGroup>
    </>
  );
}

function renderLinkAction({
  label,
  icon,
  url,
  failureMessage,
}: SettingsLinkAction) {
  return (
    <ExternalLinkButton
      key={label}
      label={label}
      url={url}
      failureMessage={failureMessage}
      channel="activity"
      style={styles.action}
    >
      <SettingsRowContent
        icon={icon}
        label={label}
        status={url ? undefined : 'Coming soon'}
        chevron={!!url}
      />
    </ExternalLinkButton>
  );
}
const styles = StyleSheet.create({ action: { paddingVertical: 0 } });
