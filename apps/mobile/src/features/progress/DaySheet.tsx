import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import type { LegacyProgressEntry as ProgressEntry } from '@justgo/contracts';
import { colors, fontFamilies, typography } from '../../theme/tokens';
import { dayLabel } from './calendar';
import { ProgressEntryRow } from './ProgressEntryRow';
export type ProgressDay = {
  date: string;
  totalReps: number;
  entries: ProgressEntry[];
};
const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);
function RetryArrow({ color = colors.white }: { color?: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 20 20" aria-hidden>
      <Path
        d="M16.6 8.2a6.8 6.8 0 0 0-11.7-2.9L3 7.2m0-3.5v3.5h3.5M3.4 11.8a6.8 6.8 0 0 0 11.7 2.9l1.9-1.9m0 3.5v-3.5h-3.5"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function DisconnectedPlugs() {
  return (
    <Image
      testID="day-initial-error-illustration"
      source={require('../../../assets/illustrations/disconnected-plugs.png')}
      style={styles.initialErrorIllustration}
      resizeMode="contain"
      aria-hidden
    />
  );
}

function DayHeading({ date }: { date: string }) {
  const { fontScale } = useWindowDimensions();
  const [titleWidth, setTitleWidth] = useState(0);
  const label = dayLabel(date);

  return (
    <View style={styles.dayHeading}>
      <View
        testID="day-title-underline-layer"
        collapsable={false}
        style={styles.dayUnderline}
        aria-hidden
      >
        {titleWidth > 0 && (
          <Svg
            testID="day-title-underline"
            width={titleWidth * 0.87}
            height={18}
            viewBox="0 0 280 14"
            preserveAspectRatio="none"
            style={styles.dayMarker}
            aria-hidden
          >
            {/* Uneven edges and a finer trailing end suggest a single marker pass. */}
            <Path
              d="M3 8.4 C37 4.1 72 2.6 108 2.9 C133 2.6 153 3.8 175 3.6 C204 3.9 233 5.5 258 6.6 C267 7 273 7.5 277.7 8.2 C280.2 8.6 280.3 10 277.4 10.4 C270 10.6 264 9.8 256 9.8 C231 9.6 206 8.5 175 8.6 C150 8.8 130 7.7 108 8 C72 7.5 38 8.8 4.1 13 C1.8 13.4 0.2 12.5 0.4 10.8 C0.5 9.5 1.3 8.7 3 8.4 Z"
              fill="#FEC9A2"
            />
          </Svg>
        )}
      </View>
      {/* Separate native layers keep the SVG below the text's descenders. */}
      <View
        testID="day-title-text-layer"
        collapsable={false}
        style={styles.dayTitleLayer}
      >
        <Text
          key={fontScale}
          accessibilityRole="header"
          accessibilityLabel={label}
          onTextLayout={({ nativeEvent }) =>
            setTitleWidth(
              Math.max(0, ...nativeEvent.lines.map((line) => line.width)),
            )
          }
          onLayout={
            Platform.OS === 'web'
              ? ({ nativeEvent }) => setTitleWidth(nativeEvent.layout.width)
              : undefined
          }
          style={[styles.dayTitle, Platform.OS === 'web' && styles.dayTitleWeb]}
        >
          {label.replace(/ (\d+)$/, '\u00a0$1')}
        </Text>
      </View>
    </View>
  );
}

export function DaySheet({
  topAccessory,
  date,
  day,
  loading,
  error,
  loadMoreError,
  hasMore,
  loadingMore,
  fetching,
  onClose,
  onRetry,
  onLoadMore,
}: {
  topAccessory?: ReactNode;
  date: string | null;
  day?: ProgressDay | undefined;
  loading: boolean;
  error: boolean;
  loadMoreError: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  fetching: boolean;
  onClose: () => void;
  onRetry?: (() => void) | undefined;
  onLoadMore?: (() => void) | undefined;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const lastRequestedCount = useRef<number | null>(null);
  const [backdropVisible, setBackdropVisible] = useState(true);
  const reduceMotion = useReducedMotion();
  const { height } = useWindowDimensions();
  const [sheetOffset] = useState(() => new Animated.Value(height));
  const openingStarted = useRef(false);
  const open = useCallback(() => {
    // Layout/show may both fire; never reset a slide that's already started.
    if (date === null || openingStarted.current) return;
    openingStarted.current = true;
    if (reduceMotion) {
      sheetOffset.setValue(0);
      return;
    }
    Animated.timing(sheetOffset, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [date, reduceMotion, sheetOffset]);
  const close = useCallback(() => {
    setBackdropVisible(false);
    if (reduceMotion) {
      sheetOffset.setValue(height);
      setExpanded(null);
      onClose();
      return;
    }
    Animated.timing(sheetOffset, {
      toValue: height,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start(({ finished }) => {
      if (finished) {
        setExpanded(null);
        onClose();
      }
    });
  }, [height, onClose, reduceMotion, sheetOffset]);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 90 || gesture.vy > 0.8) {
            close();
          }
        },
      }),
    [close],
  );
  const loadNearEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!day || !hasMore || fetching || loadMoreError || !onLoadMore) return;
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (
      contentOffset.y <= 0 ||
      contentOffset.y + layoutMeasurement.height < contentSize.height - 160 ||
      lastRequestedCount.current === day.entries.length
    )
      return;
    lastRequestedCount.current = day.entries.length;
    onLoadMore();
  };
  return (
    <Modal
      visible={date !== null}
      transparent
      animationType="none"
      onShow={open}
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={{ flex: 1 }} accessibilityViewIsModal>
        {topAccessory}
        <View style={styles.modalRoot}>
          <Pressable
            testID="day-sheet-backdrop"
            accessibilityRole="button"
            accessibilityLabel="Close day details"
            onPress={close}
            style={[styles.backdrop, !backdropVisible && styles.backdropHidden]}
          />
          <AnimatedSafeAreaView
            testID="day-sheet-panel"
            onLayout={open}
            edges={['bottom']}
            style={[
              styles.sheet,
              error && !day && { minHeight: Math.min(470, height * 0.78) },
              { transform: [{ translateY: sheetOffset }] },
            ]}
          >
            <View {...responder.panHandlers} style={styles.handleArea}>
              <View style={styles.handle} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close day details"
              onPress={close}
              style={styles.close}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
            {date && <DayHeading date={date} />}
            {loading && !day ? (
              <View style={styles.state}>
                <ActivityIndicator
                  accessibilityLabel="Loading day details"
                  color={colors.ink}
                />
                <Text style={styles.stateText}>Loading this day…</Text>
              </View>
            ) : error && !day ? (
              <View testID="day-initial-error" style={styles.initialError}>
                <DisconnectedPlugs />
                <Text
                  accessibilityRole="alert"
                  style={styles.initialErrorTitle}
                >
                  Couldn’t load attempts
                </Text>
                <Text style={styles.initialErrorBody}>
                  We couldn’t get your challenge attempts. Please try again.
                </Text>
                {onRetry && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Try loading attempts again"
                    onPress={onRetry}
                    style={styles.initialRetry}
                  >
                    <RetryArrow />
                    <Text style={styles.initialRetryText}>Try again</Text>
                  </Pressable>
                )}
              </View>
            ) : day ? (
              <>
                <ScrollView
                  testID="day-sheet-entry-list"
                  style={styles.entriesScroll}
                  contentContainerStyle={styles.entries}
                  onScroll={loadNearEnd}
                  scrollEventThrottle={16}
                >
                  {day.entries.map((entry, index) => (
                    <ProgressEntryRow
                      key={entry.attemptId}
                      entry={entry}
                      index={index}
                      expanded={expanded === entry.attemptId}
                      reduceMotion={reduceMotion}
                      onToggle={() =>
                        setExpanded(
                          expanded === entry.attemptId ? null : entry.attemptId,
                        )
                      }
                    />
                  ))}
                  {loadMoreError ? (
                    <View
                      testID="day-load-more-error"
                      style={styles.moreErrorState}
                    >
                      <Text accessibilityRole="alert" style={styles.moreError}>
                        Couldn’t load more attempts
                      </Text>
                      {onRetry && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Try loading more attempts again"
                          onPress={onRetry}
                          style={styles.moreRetry}
                        >
                          <RetryArrow color={colors.ink} />
                          <Text style={styles.moreRetryText}>Try again</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : loadingMore ? (
                    <View testID="day-loading-more" style={styles.moreLoading}>
                      <ActivityIndicator
                        accessibilityLabel="Loading more attempts"
                        color={colors.ink}
                        size="small"
                      />
                    </View>
                  ) : null}
                </ScrollView>
              </>
            ) : null}
          </AnimatedSafeAreaView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  state: { paddingVertical: 12, alignItems: 'center', gap: 4 },
  stateText: { ...typography.body, color: colors.ink, textAlign: 'center' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#102C49AA',
  },
  backdropHidden: { backgroundColor: 'transparent' },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 23,
    maxHeight: '78%',
    minHeight: 360,
  },
  handleArea: {
    height: 32,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 10,
  },
  handle: { width: 52, height: 6, borderRadius: 3, backgroundColor: '#DDDAD6' },
  close: {
    position: 'absolute',
    right: 8,
    top: 21,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  closeText: {
    fontFamily: fontFamilies.regular,
    fontSize: 36,
    color: colors.ink,
    lineHeight: 40,
  },
  dayHeading: { paddingTop: 10, paddingRight: 20, paddingBottom: 14 },
  dayTitleLayer: { zIndex: 1 },
  dayTitle: {
    fontFamily: fontFamilies.editorial,
    color: colors.ink,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  dayTitleWeb: { alignSelf: 'flex-start', maxWidth: '100%' },
  dayUnderline: {
    pointerEvents: 'none',
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 14,
    zIndex: 0,
  },
  dayMarker: { transform: [{ translateY: -6 }] },
  initialError: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
  },
  initialErrorIllustration: { width: 250, height: 110 },
  initialErrorTitle: {
    fontFamily: fontFamilies.editorial,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
    marginTop: 2,
  },
  initialErrorBody: {
    fontFamily: fontFamilies.regular,
    fontSize: 15,
    lineHeight: 22,
    color: '#617897',
    textAlign: 'center',
    maxWidth: 325,
    marginTop: 8,
  },
  initialRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    minWidth: 184,
    minHeight: 48,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: colors.ink,
    marginTop: 24,
  },
  initialRetryText: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 20,
    color: colors.white,
  },
  entriesScroll: { marginTop: 12 },
  entries: { paddingRight: 12, paddingBottom: 24 },
  moreErrorState: {
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: '#D8D6CF',
  },
  moreError: {
    fontFamily: fontFamilies.regular,
    fontSize: 14,
    lineHeight: 20,
    color: '#617897',
    textAlign: 'center',
  },
  moreRetry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 16,
  },
  moreRetryText: {
    fontFamily: fontFamilies.medium,
    fontSize: 16,
    lineHeight: 20,
    color: colors.ink,
  },
  moreLoading: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
