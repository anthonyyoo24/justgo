import { useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ProviderLogo } from '../../../components/auth/ProviderLogo';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { useModalIsolation } from '../../../platform/modals/useModalIsolation';
import { useSheetMotion } from '../../../platform/modals/useSheetMotion';
import {
  colors,
  fontFamilies,
  layout,
  radii,
  spacing,
  typography,
} from '../../../theme/tokens';

type Props = {
  busy: boolean;
  disabled: boolean;
  error: string | null;
  actionLabel?: string;
  reduceMotion: boolean;
  onClose: () => void;
  onStart: () => void;
};

/** The illustration is decorative; disclosure and actions remain native controls. */
export function ICloudSyncSheet(props: Props) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const {
    offset,
    open,
    close: animateClose,
    backdropVisible,
  } = useSheetMotion(true, props.onClose, props.reduceMotion);
  const close = () => {
    if (!props.busy) animateClose();
  };
  return (
    <Modal
      visible
      transparent
      presentationStyle="overFullScreen"
      animationType="none"
      onShow={open}
      onRequestClose={close}
      statusBarTranslucent
    >
      <View
        testID="icloud-sync-modal-root"
        style={[styles.root, { paddingTop: insets.top + spacing.sm }]}
      >
        <Pressable
          testID="icloud-sync-backdrop"
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          disabled={props.busy}
          onPress={close}
          style={[styles.backdrop, !backdropVisible && styles.backdropHidden]}
        />
        <SheetContent
          {...props}
          disabled={props.disabled || !backdropVisible}
          onClose={close}
          onLayout={open}
          offset={offset}
          height={height}
          bottomInset={insets.bottom}
        />
      </View>
    </Modal>
  );
}

function SheetContent({
  busy,
  disabled,
  error,
  actionLabel = 'Start Syncing',
  onClose,
  onStart,
  height,
  bottomInset,
  onLayout,
  offset,
}: Props & {
  height: number;
  bottomInset: number;
  onLayout: () => void;
  offset: Animated.Value;
}) {
  const surface = useRef<View>(null);
  const { fontScale } = useWindowDimensions();
  useModalIsolation(surface);
  return (
    <Animated.View
      ref={surface}
      testID="icloud-sync-sheet"
      role="dialog"
      aria-modal
      accessibilityLabel="iCloud Sync"
      accessibilityViewIsModal
      onLayout={onLayout}
      onAccessibilityEscape={() => {
        if (!busy) onClose();
      }}
      style={[
        styles.sheet,
        {
          height: Math.max(560, height * 0.75),
          transform: [{ translateY: offset }],
        },
      ]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text accessibilityRole="header" style={styles.title}>
          iCloud Sync
        </Text>
        <Text style={styles.body}>
          Your Apple ID will be used to securely save your challenge history,
          feelings and reflections in iCloud.
        </Text>
        <View
          testID="icloud-sync-artwork"
          style={[styles.artwork, { height: Math.min(300, height * 0.36) }]}
        >
          <Image
            source={require('../../../../assets/illustrations/icloud-progress-cards.png')}
            contentFit="contain"
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={StyleSheet.absoluteFill}
          />
        </View>
        <View
          testID="icloud-sync-message-space"
          style={[styles.messageSpace, { minHeight: 40 * fontScale }]}
        >
          {error && (
            <Text
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={styles.error}
            >
              {error}
            </Text>
          )}
        </View>
      </ScrollView>
      <View
        style={[styles.footer, { paddingBottom: bottomInset + spacing.lg }]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          accessibilityState={{ disabled: disabled || busy, busy }}
          aria-busy={busy}
          disabled={disabled || busy}
          onPress={onStart}
          style={({ pressed }) => [
            styles.start,
            busy && styles.startBusy,
            pressed && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator
              color={colors.cream}
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel="Starting iCloud sync"
            />
          ) : (
            <>
              <Text style={styles.startLabel}>{actionLabel}</Text>
              <ProviderLogo
                provider="apple"
                appleColor={colors.cream}
                size={20 * fontScale}
              />
            </>
          )}
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close iCloud Sync"
        accessibilityState={{ disabled: busy }}
        disabled={busy}
        onPress={onClose}
        style={({ pressed }) => [styles.close, pressed && styles.pressed]}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" aria-hidden>
          <Path
            d="M4 4l16 16M20 4L4 20"
            stroke={colors.ink}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </Svg>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  backdropHidden: { backgroundColor: 'transparent' },
  sheet: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    maxHeight: '100%',
    backgroundColor: colors.peach,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    overflow: 'hidden',
  },
  scroll: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingTop: 52,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.heading,
    fontFamily: fontFamilies.editorial,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.ink,
  },
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: colors.ink,
  },
  artwork: { flexShrink: 0 },
  messageSpace: { flexShrink: 0 },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  start: {
    minHeight: 56,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  startLabel: {
    fontFamily: fontFamilies.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: colors.cream,
    flexShrink: 1,
  },
  startBusy: { justifyContent: 'center' },
  close: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  error: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: '#8B1E32',
  },
});
