import { Children, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  colors,
  fontFamilies,
  layout,
  radii,
  spacing,
  typography,
} from '../../theme/tokens';
import { SettingsIcon, type SettingsIconName } from './SettingsIcon';

export function SettingsGroup({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.heading}>
        {title}
      </Text>
      <View style={styles.card}>
        {Children.toArray(children).map((child, index) => (
          <View key={index}>
            {index > 0 && <View style={styles.divider} />}
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

export function SettingsRowContent({
  icon,
  label,
  status,
  chevron = false,
  accessory,
}: {
  icon: SettingsIconName;
  label: string;
  status?: string | undefined;
  chevron?: boolean;
  accessory?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.icon}>
        <SettingsIcon name={icon} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
      </View>
      {status && <Text style={styles.status}>{status}</Text>}
      {accessory}
      {chevron && (
        <View style={styles.chevron}>
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
  icon: { width: 24, height: 24, flexShrink: 0 },
  copy: { flex: 1 },
  label: { ...typography.body, color: colors.ink },
  status: {
    ...typography.caption,
    color: colors.ink,
    maxWidth: 76,
    textAlign: 'right',
    flexShrink: 1,
  },
  chevron: { width: 24, flexShrink: 0 },
});
