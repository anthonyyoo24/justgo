import { useRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScaledText as Text } from '../typography/ScaledText';
import { useModalIsolation } from '../../platform/modals/useModalIsolation';
import { colors, fontFamilies, layout, spacing } from '../../theme/tokens';

type ConfirmationProps = {
  title: string;
  message: string;
  confirmLabel: string;
  progressLabel: string;
  busy: boolean;
  error: string | null;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  destructive?: boolean;
};

export function ConfirmationModal(props: ConfirmationProps) {
  // Read the existing window's insets before presenting the native modal.
  const insets = useSafeAreaInsets();
  return (
    <Modal
      transparent
      visible
      presentationStyle="overFullScreen"
      animationType="none"
      onRequestClose={() => {
        if (!props.busy) props.onCancel();
      }}
    >
      <View
        style={[
          styles.scrim,
          {
            paddingTop: Math.max(spacing.xl, insets.top),
            paddingBottom: Math.max(spacing.xl, insets.bottom),
          },
        ]}
      >
        <ConfirmationContent {...props} />
      </View>
    </Modal>
  );
}

function ConfirmationContent({
  busy,
  error,
  title,
  message,
  confirmLabel,
  progressLabel,
  disabled,
  onCancel,
  onConfirm,
  destructive = false,
}: ConfirmationProps) {
  const surface = useRef<ViewInstance>(null);
  const stacked = useWindowDimensions().fontScale > 1.3;
  useModalIsolation(surface);
  return (
    <View
      ref={surface}
      role="alertdialog"
      aria-modal
      accessibilityLabel={title}
      accessibilityViewIsModal
      onAccessibilityEscape={() => {
        if (!busy) onCancel();
      }}
      style={styles.dialog}
    >
      <ScrollView style={styles.scroll} contentContainerStyle={styles.copy}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.message}>{message}</Text>
        {error && (
          <Text
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            style={[styles.message, styles.destructive]}
          >
            {error}
          </Text>
        )}
      </ScrollView>
      <View style={[styles.actions, stacked && styles.stackedActions]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cancel"
          accessibilityState={{ disabled: busy }}
          disabled={busy}
          onPress={onCancel}
          style={({ pressed }) => [
            styles.action,
            stacked && styles.stackedAction,
            pressed && styles.pressed,
          ]}
        >
          <Text maxFontSizeMultiplier={2} style={styles.actionLabel}>
            Cancel
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
          accessibilityState={{ disabled: busy || disabled, busy }}
          aria-busy={busy}
          disabled={busy || disabled}
          onPress={onConfirm}
          style={({ pressed }) => [
            styles.action,
            stacked && styles.stackedAction,
            stacked ? styles.stackedConfirm : styles.confirm,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator
              color={destructive ? '#B3261E' : colors.ink}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={progressLabel}
            />
          ) : (
            <Text
              maxFontSizeMultiplier={2}
              style={[styles.actionLabel, destructive && styles.destructive]}
            >
              {confirmLabel}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  dialog: {
    width: '100%',
    maxWidth: 320,
    maxHeight: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  scroll: { flexShrink: 1 },
  copy: { padding: spacing.xl, gap: spacing.sm },
  title: {
    fontFamily: fontFamilies.semibold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.ink,
    textAlign: 'center',
  },
  message: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 21,
    color: colors.ink,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexShrink: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  stackedActions: { flexDirection: 'column' },
  action: {
    flex: 1,
    minHeight: layout.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  stackedAction: { flex: 0, width: '100%' },
  confirm: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  stackedConfirm: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actionLabel: {
    fontFamily: fontFamilies.semibold,
    fontSize: 17,
    lineHeight: 23,
    color: colors.ink,
    textAlign: 'center',
    flexShrink: 1,
  },
  destructive: { color: '#B3261E' },
  pressed: { backgroundColor: colors.successCanvas },
});
