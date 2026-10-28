import { Children, type PropsWithChildren, type ReactNode } from 'react';
import { Link, type Href } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  colors,
  fontFamilies,
  layout,
  radii,
  spacing,
  typography,
} from '../../theme/tokens';
import { SettingsIcon, type SettingsIconName } from './SettingsIcon';
import { ScaledText as Text } from '../typography/ScaledText';

export function SettingsGroup({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.group}>
      <Text
        accessibilityRole="header"
        maxFontSizeMultiplier={2}
        style={styles.heading}
      >
        {title}
      </Text>
      <View style={styles.card}>
        {Children.toArray(children).map((child, index) => (
          <View key={index}>
            {index > 0 && <SettingsRowDivider />}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

export function SettingsRowDivider() {
  return <View style={styles.divider} />;
}

export function SettingsRowContent({
  icon,
  label,
  status,
  chevron = false,
  accessory,
  destructive = false,
}: {
  icon: SettingsIconName;
  label: string;
  status?: string | undefined;
  chevron?: boolean;
  accessory?: ReactNode;
  destructive?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const expanded = fontScale > 1.3;
  const firstLineHeight = typography.body.lineHeight * Math.min(fontScale, 2);
  return (
    <View style={[styles.row, expanded && styles.expandedRow]}>
      <View style={[styles.icon, expanded && { height: firstLineHeight }]}>
        <SettingsIcon
          name={icon}
          color={destructive ? styles.destructive.color : colors.ink}
        />
      </View>
      <View style={styles.copy}>
        <Text
          maxFontSizeMultiplier={2}
          style={[styles.label, destructive && styles.destructive]}
        >
          {label}
        </Text>
        {status && expanded && (
          <Text maxFontSizeMultiplier={2} style={styles.expandedStatus}>
            {status}
          </Text>
        )}
      </View>
      {status && !expanded && (
        <Text maxFontSizeMultiplier={2} style={styles.status}>
          {status}
        </Text>
      )}
      {Boolean(accessory) && (
        <View
          style={expanded && [styles.accessory, { minHeight: firstLineHeight }]}
        >
          {accessory}
        </View>
      )}
      {chevron && (
        <View style={[styles.chevron, expanded && { height: firstLineHeight }]}>
          <SettingsIcon name="chevron" />
        </View>
      )}
    </View>
  );
}

export function PendingSettingsRow({
  icon,
  label,
}: {
  icon: SettingsIconName;
  label: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}. Not available yet.`}
      accessibilityState={{ disabled: true }}
    >
      <SettingsRowContent icon={icon} label={label} status="Coming soon" />
    </View>
  );
}

export function SettingsActionRow({
  icon,
  label,
  onPress,
  disabled = false,
  busy = false,
  chevron = false,
  href,
  destructive = false,
}: {
  icon: SettingsIconName;
  label: string;
  disabled?: boolean;
  busy?: boolean;
  chevron?: boolean;
  destructive?: boolean;
} & ({ href: Href; onPress?: never } | { href?: never; onPress: () => void })) {
  const control = (
    <Pressable
      accessibilityRole={href ? 'link' : 'button'}
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => pressed && { opacity: 0.65 }}
    >
      <SettingsRowContent
        icon={icon}
        label={label}
        destructive={destructive}
        chevron={chevron && !busy}
        accessory={
          busy ? (
            <ActivityIndicator
              color={colors.ink}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={`${label} in progress`}
            />
          ) : undefined
        }
      />
    </Pressable>
  );
  // Link supplies a real web anchor and native navigation; a disabled row has
  // no destination so Enter cannot bypass its busy guard.
  return href && !disabled && !busy ? (
    <Link href={href} asChild>
      {control}
    </Link>
  ) : (
    control
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  heading: {
    ...typography.heading,
    fontFamily: fontFamilies.editorial,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.25,
    color: colors.ink,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  divider: {
    marginLeft: spacing.lg + 24 + spacing.lg,
    marginRight: spacing.lg,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.buttonHeight + spacing.sm,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  expandedRow: { alignItems: 'flex-start' },
  icon: { width: 24, height: 24, flexShrink: 0, justifyContent: 'center' },
  copy: { flex: 1, gap: spacing.xs },
  label: { ...typography.body, color: colors.ink },
  destructive: { color: '#B3261E' },
  status: {
    ...typography.caption,
    color: colors.ink,
    maxWidth: 76,
    textAlign: 'right',
    flexShrink: 1,
  },
  expandedStatus: { ...typography.caption, color: colors.ink },
  accessory: {
    justifyContent: 'center',
    minHeight: layout.minTouchTarget,
    flexShrink: 0,
  },
  chevron: { width: 24, flexShrink: 0, justifyContent: 'center' },
});
