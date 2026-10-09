import { Link, useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ExternalLinkButton } from '../../components/ExternalLinkButton';
import { useIdentity } from '../providers/AppProvider';
import {
  contactFailureMessage,
  featureRequestContact,
  supportContact,
} from '../contact';
import {
  colors,
  fontFamilies,
  layout,
  spacing,
  typography,
} from '../../theme/tokens';
import { appleStandardTerms, getLegalLinks } from './legal-links';
import { SettingsIcon } from './SettingsIcon';
import {
  PendingSettingsRow,
  SettingsGroup,
  SettingsRowContent,
} from './SettingsRows';

export function SettingsScreen() {
  const router = useRouter();
  const { account } = useIdentity();
  const legal = getLegalLinks();
  const version = Constants.expoConfig?.version;
  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              accessibilityHint="Return to the previous screen"
              onPress={() =>
                router.canGoBack() ? router.back() : router.replace('/')
              }
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <SettingsIcon name="back" />
            </Pressable>
            <Text accessibilityRole="header" style={styles.title}>
              Settings
            </Text>
            <View style={styles.headerSlot} />
          </View>

          <SettingsGroup title="Preferences">
            <PendingSettingsRow icon="haptics" label="Haptics" />
            <PendingSettingsRow icon="motion" label="Reduce motion" />
          </SettingsGroup>

          <SettingsGroup
            title="Account & data"
            note="Activity saves on this phone first. Uploaded activity can be recovered on another device; activity waiting to upload stays on this phone."
          >
            <Link href="/recovery" asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel="Account & recovery"
                style={({ pressed }) => pressed && styles.pressed}
              >
                <SettingsRowContent
                  icon="account"
                  label="Account & recovery"
                  detail={
                    account
                      ? 'Recovery keys, device transfer & devices'
                      : 'Connect or recover your account'
                  }
                  chevron
                />
              </Pressable>
            </Link>
            <PendingSettingsRow icon="export" label="Export my data" />
            <PendingSettingsRow icon="delete" label="Delete account" />
          </SettingsGroup>

          <SettingsGroup
            title="Privacy"
            note="Optional analytics are off. Reflection text is never included in analytics."
          >
            <PendingSettingsRow icon="analytics" label="General analytics" />
            <PendingSettingsRow icon="sensitive" label="Sensitive metadata" />
          </SettingsGroup>

          <SettingsGroup title="Support">
            <ExternalLinkButton
              label="Get help"
              url={supportContact}
              failureMessage={contactFailureMessage}
              channel="activity"
              style={styles.external}
            >
              <SettingsRowContent icon="help" label="Get help" chevron />
            </ExternalLinkButton>
          </SettingsGroup>

          <SettingsGroup
            title="Feature requests"
            note="Send a private suggestion by email. No activity or account information is attached."
          >
            <ExternalLinkButton
              label="Suggest a feature"
              url={featureRequestContact}
              failureMessage={contactFailureMessage}
              channel="activity"
              style={styles.external}
            >
              <SettingsRowContent
                icon="idea"
                label="Suggest a feature"
                chevron
              />
            </ExternalLinkButton>
          </SettingsGroup>

          <SettingsGroup title="Legal">
            <ExternalLinkButton
              label="Privacy policy"
              url={legal.privacy}
              failureMessage="Couldn’t open the Privacy Policy. Please try again."
              channel="activity"
              style={styles.external}
            >
              <SettingsRowContent
                icon="privacy"
                label="Privacy policy"
                status={legal.privacy ? undefined : 'Coming soon'}
                chevron={!!legal.privacy}
              />
            </ExternalLinkButton>
            <ExternalLinkButton
              label="Terms of use"
              url={legal.terms}
              failureMessage="Couldn’t open the Terms of Use. Please try again."
              channel="activity"
              style={styles.external}
            >
              <SettingsRowContent
                icon="terms"
                label="Terms of use"
                detail={
                  legal.terms === appleStandardTerms
                    ? 'Apple’s standard license agreement'
                    : undefined
                }
                status={legal.terms ? undefined : 'Coming soon'}
                chevron={!!legal.terms}
              />
            </ExternalLinkButton>
          </SettingsGroup>

          <Text style={styles.footer}>
            JustGO{version ? ` · Version ${version}` : ''}
          </Text>
          {__DEV__ && (
            <Link href="/preview" style={styles.preview}>
              Preview app screens
            </Link>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.successCanvas },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  headerSlot: { width: layout.minTouchTarget, flexShrink: 0 },
  back: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    borderRadius: layout.minTouchTarget / 2,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    ...typography.heading,
    fontFamily: fontFamilies.editorial,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.ink,
    flex: 1,
    textAlign: 'center',
  },
  pressed: { opacity: 0.65 },
  external: { paddingVertical: 0 },
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
