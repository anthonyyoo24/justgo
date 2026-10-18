import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';
import { Link } from 'expo-router';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import { colors, fontFamilies, layout } from '../../theme/tokens';

export function AcceptanceView({
  busy = false,
  checking = false,
  error = '',
  busyLabel = 'Saving your acceptance',
  actionLabel = 'I Accept',
  insets: measuredInsets,
  legalNotice,
  termsUrl,
  privacyUrl,
  onAccept,
  onOpenTerms,
  onOpenPrivacy,
}: {
  busy?: boolean;
  checking?: boolean;
  error?: string;
  busyLabel?: string;
  actionLabel?: string;
  insets?: EdgeInsets;
  legalNotice?: string | undefined;
  termsUrl?: string | undefined;
  privacyUrl?: string | undefined;
  onAccept: () => void;
  onOpenTerms: () => void;
  onOpenPrivacy: () => void;
}) {
  const inheritedInsets = useSafeAreaInsets();
  const insets = measuredInsets ?? inheritedInsets;
  const pending = busy || checking;
  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView
        bounces={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View
            style={[
              styles.headingContainer,
              {
                paddingLeft: Math.max(24, insets.left),
                paddingRight: Math.max(24, insets.right),
              },
            ]}
          >
            <Text accessibilityRole="header" style={styles.heading}>
              Terms & Privacy
            </Text>
          </View>
          <Svg
            width="100%"
            height={24}
            viewBox="0 0 320 24"
            preserveAspectRatio="none"
            aria-hidden
          >
            <Path
              d="M0 17 C60 1 100 2 160 12 C220 24 265 25 320 7 L320 24 L0 24 Z"
              fill={acceptanceColors.cream}
            />
          </Svg>
        </View>
        <View
          style={[
            styles.body,
            {
              paddingBottom: Math.max(20, insets.bottom),
              paddingLeft: Math.max(24, insets.left),
              paddingRight: Math.max(24, insets.right),
            },
          ]}
        >
          <View style={styles.explanation}>
            <Text accessibilityRole="header" style={styles.subheading}>
              Your data is yours
            </Text>
            <Text style={styles.paragraph}>
              Your activity and reflections are saved on your phone and to your
              private JustGO account. We won’t sell your data without your
              permission.
            </Text>
            <Text style={styles.paragraph}>
              We use account-linked app-usage information, feeling selections
              and approximate reflection lengths through PostHog to improve
              JustGO. A random identifier links this information to your
              account. Your written reflections are never sent to analytics.
            </Text>
          </View>
          <View style={styles.spacer} />
          <View style={styles.footer}>
            {!!error && (
              <Text
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
                style={styles.error}
              >
                {error}
              </Text>
            )}
            <View style={styles.legalCopy}>
              {!!legalNotice && (
                <Text style={[styles.paragraph, styles.legalNotice]}>
                  {legalNotice}
                </Text>
              )}
              <Text style={styles.paragraph}>
                {'By continuing, you agree to our\n'}
                <LegalLink
                  label="Terms of Service"
                  url={termsUrl}
                  onOpen={onOpenTerms}
                />
                {' and '}
                <LegalLink
                  label="Privacy Policy"
                  url={privacyUrl}
                  onOpen={onOpenPrivacy}
                  punctuation="."
                />
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={actionLabel}
              accessibilityState={{ disabled: pending, busy: pending }}
              disabled={pending}
              onPress={onAccept}
              style={({ pressed }) => [
                styles.button,
                pressed && styles.pressed,
              ]}
            >
              {pending ? (
                <ActivityIndicator
                  color={colors.white}
                  accessible
                  accessibilityRole="progressbar"
                  accessibilityLabel={
                    checking ? 'Checking your acceptance' : busyLabel
                  }
                />
              ) : (
                <Text style={styles.buttonLabel}>{actionLabel}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function LegalLink({
  label,
  url,
  onOpen,
  punctuation = '',
}: {
  label: string;
  url: string | undefined;
  onOpen: () => void;
  punctuation?: string;
}) {
  const externalUrl = isExternalUrl(url) ? url : undefined;
  const link = (
    <Text
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={externalUrl ? undefined : onOpen}
      style={styles.linkLabel}
    >
      {label}
      {punctuation}
    </Text>
  );
  if (!externalUrl) return link;
  return (
    <Link
      href={externalUrl}
      asChild
      onPress={(event) => {
        // The controller opens links and reports failures on both platforms.
        event.preventDefault();
        onOpen();
      }}
    >
      {link}
    </Link>
  );
}

function isExternalUrl(
  url: string | undefined,
): url is `https://${string}` | `http://${string}` {
  return !!url && (url.startsWith('https://') || url.startsWith('http://'));
}

// Exact editable values from the approved Paper Terms & Privacy navy variant.
const acceptanceColors = { cream: '#FBF7EF', muted: '#526170' } as const;
const headingFont = Platform.select({
  ios: 'TimesNewRomanPS-BoldMT',
  web: '"Times New Roman", Times, serif',
  default: 'serif',
});
const bodyFont = {
  fontFamily: fontFamilies.regular,
  fontSize: 13,
  lineHeight: 17,
  color: acceptanceColors.muted,
} as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: acceptanceColors.cream },
  content: { flexGrow: 1 },
  header: { backgroundColor: colors.ink, flexShrink: 0 },
  headingContainer: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    paddingTop: 10,
    paddingBottom: 20,
  },
  heading: {
    flexShrink: 1,
    fontFamily: headingFont,
    fontWeight: '700',
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.56,
    color: colors.white,
  },
  body: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
    flexGrow: 1,
    paddingTop: 20,
  },
  explanation: { gap: 12 },
  subheading: {
    fontFamily: headingFont,
    fontWeight: '700',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.33,
    color: colors.ink,
  },
  paragraph: bodyFont,
  spacer: { flexGrow: 1, minHeight: 18 },
  footer: { gap: 28 },
  legalCopy: { flexShrink: 0 },
  legalNotice: { marginBottom: 12 },
  linkLabel: {
    ...bodyFont,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  button: {
    minHeight: 48,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: colors.ink,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontFamily: fontFamilies.medium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.white,
    textAlign: 'center',
  },
  pressed: { opacity: 0.7 },
  error: { ...bodyFont, color: '#8B1E32' },
});
