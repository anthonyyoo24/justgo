import { useEffect, useRef } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScaledText as Text } from '../../components/typography/ScaledText';
import { useModalIsolation } from '../../platform/modals/useModalIsolation';
import { colors, radii, spacing, typography } from '../../theme/tokens';
import { SavingDetails } from './SavingDetails';
import { ToastHost } from '../../platform/toast/Toast';
import { useRuntime } from '../providers/AppProvider';

type Props = {
  onClose: () => void;
  onNavigate?: ((proceed: () => void) => void) | undefined;
  navigationEnabled: boolean;
  toastChannel: string;
};
export function SavingDetailsModal(props: Props) {
  const insets = useSafeAreaInsets();
  const { activity } = useRuntime();
  const channel = `${props.toastChannel}-details`;
  useEffect(() => {
    const previous = activity.toastChannel;
    activity.setToastChannel(channel);
    return () => {
      if (activity.toastChannel === channel) activity.setToastChannel(previous);
    };
  }, [activity, channel]);
  return (
    <Modal
      transparent
      visible
      animationType="none"
      presentationStyle="overFullScreen"
      onRequestClose={props.onClose}
    >
      <View
        style={[
          styles.scrim,
          {
            paddingTop: insets.top + spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
          },
        ]}
      >
        <DetailsContent {...props} />
      </View>
      <ToastHost channel={`${props.toastChannel}-details`} />
    </Modal>
  );
}
function DetailsContent({
  onClose,
  onNavigate,
  navigationEnabled,
  toastChannel,
}: Props) {
  const surface = useRef<ViewInstance>(null);
  useModalIsolation(surface);
  return (
    <View
      ref={surface}
      role="dialog"
      aria-modal
      accessibilityLabel="Saving details"
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
      style={styles.dialog}
    >
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.heading}>
          Saving details
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close saving details"
          onPress={onClose}
          style={styles.close}
        >
          <Text style={styles.label}>Close</Text>
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <SavingDetails
          navigationEnabled={navigationEnabled}
          toastChannel={`${toastChannel}-details`}
          onNavigate={(proceed) => {
            onClose();
            if (onNavigate) onNavigate(proceed);
            else proceed();
          }}
        />
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: '#102C4980',
  },
  dialog: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '100%',
    backgroundColor: colors.white,
    borderRadius: radii.card,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.lg,
    gap: spacing.sm,
  },
  heading: { ...typography.heading, color: colors.ink, flex: 1 },
  close: {
    minWidth: 60,
    minHeight: 44,
    padding: spacing.md,
    justifyContent: 'center',
  },
  label: { ...typography.body, color: colors.ink },
  scroll: { flexShrink: 1 },
  content: { padding: spacing.lg },
});
