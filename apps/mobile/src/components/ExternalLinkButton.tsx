import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Linking,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { ScaledText as Text } from './typography/ScaledText';
import { showMessageToast } from '../platform/toast/Toast';
import { colors, layout, spacing, typography } from '../theme/tokens';

/** Open a user-reviewed destination; never attach app state or private content. */
export function ExternalLinkButton({
  label,
  url,
  failureMessage,
  channel,
  style,
  children,
}: {
  label: string;
  url: string | null;
  failureMessage: string;
  channel: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const opening = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const open = async () => {
    if (!url || opening.current) return;
    opening.current = true;
    setBusy(true);
    try {
      await Linking.openURL(url);
    } catch {
      // Native errors may include URLs or device details. Show only approved copy.
      if (mounted.current) showMessageToast(channel, failureMessage);
    } finally {
      opening.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !url || busy, busy }}
      disabled={!url || busy}
      onPress={() => {
        // open owns link failures and restores the control for another attempt.
        void open();
      }}
      style={({ pressed }) => [
        styles.button,
        style,
        (pressed || !url || busy) && styles.dimmed,
      ]}
    >
      {children ?? (
        <Text maxFontSizeMultiplier={2} style={styles.label}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  button: {
    minHeight: layout.minTouchTarget,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  label: {
    ...typography.label,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  dimmed: { opacity: 0.65 },
});
