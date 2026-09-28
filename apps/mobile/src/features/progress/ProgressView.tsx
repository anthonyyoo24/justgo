import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import {
  feelingChoices,
  type FeelingCode,
  type ProgressEntry,
  type ProgressResponse,
} from '@justgo/contracts';
import { ScreenHeader } from '../../components/ScreenHeader';
import { challengeScale } from '../challenges/challenge-design';
import { colors, fontFamilies, layout, typography } from '../../theme/tokens';
import { FeelingFace } from '../reflections/FeelingFace';
import {
  calendarCells,
  completionTime,
  dayLabel,
  durationLabel,
  monthLabel,
} from './calendar';

type Day = {
  date: string;
  totalReps: number;
  totalElapsedSeconds: number;
  entries: ProgressEntry[];
};
export type ProgressViewProps = {
  month: string;
  data?: ProgressResponse | undefined;
  loading?: boolean;
  error?: boolean;
  selectedDate: string | null;
  day?: Day | undefined;
  dayLoading?: boolean;
  dayError?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  insetTop?: boolean;
  onMonth: (offset: number) => void;
  onOpenDay: (date: string) => void;
  onCloseDay: () => void;
  onRetryMonth?: (() => void) | undefined;
  onRetryDay?: (() => void) | undefined;
  onLoadMore?: (() => void) | undefined;
};

const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const entryMetaInk = '#5F7391';
const AnimatedSafeAreaView = Animated.createAnimatedComponent(SafeAreaView);
const feelingLabel = (feeling: FeelingCode | null) =>
  feelingChoices.find((option) => option.code === feeling)?.label ??
  'Not recorded';

export function ProgressView({
  month,
  data,
  loading = false,
  error = false,
  selectedDate,
  day,
  dayLoading = false,
  dayError = false,
  hasMore = false,
  loadingMore = false,
  insetTop = true,
  onMonth,
  onOpenDay,
  onCloseDay,
  onRetryMonth,
  onRetryDay,
  onLoadMore,
}: ProgressViewProps) {
  const { width } = useWindowDimensions();
  const headerScale = challengeScale(width);
  const cells = useMemo(() => calendarCells(month), [month]);
  const counts = useMemo(
    () => new Map(data?.days.map((item) => [item.date, item.reps]) ?? []),
    [data],
  );
  return (
    <SafeAreaView
      edges={insetTop ? ['top', 'left', 'right'] : ['left', 'right']}
      style={styles.safe}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <View
            style={[
              styles.header,
              { width: Math.min(width, 384) - 28 * headerScale },
            ]}
          >
            <ScreenHeader title="Progress" scale={headerScale} />
          </View>
          <View testID="progress-calendar-card" style={styles.card}>
            <View style={styles.stats}>
              <Metric
                icon="streak"
                label="Current streak"
                value={data?.currentStreak ?? null}
                suffix="days"
              />
              <Metric
                icon="best"
                label="Best streak"
                value={data?.bestStreak ?? null}
                suffix="days"
              />
              <Metric
                icon="reps"
                label="Total reps"
                value={data?.totalReps ?? null}
              />
            </View>
            <View style={styles.monthHeader}>
              <Text accessibilityRole="header" style={styles.monthTitle}>
                {monthLabel(month)}
              </Text>
              <View style={styles.monthButtons}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Previous month"
                  onPress={() => onMonth(-1)}
                  style={styles.arrow}
                >
                  <Text style={styles.arrowText}>‹</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Next month"
                  onPress={() => onMonth(1)}
                  style={styles.arrow}
                >
                  <Text style={styles.arrowText}>›</Text>
                </Pressable>
              </View>
            </View>
            {!data && (
              <View style={styles.state}>
                {loading && !error ? (
                  <>
                    <ActivityIndicator
                      accessibilityLabel="Loading progress"
                      color={colors.ink}
                    />
                    <Text style={styles.stateText}>Loading your progress…</Text>
                  </>
                ) : (
                  <>
                    <Text accessibilityRole="alert" style={styles.stateText}>
                      We couldn’t load your progress.
                    </Text>
                    <Retry label="Retry progress" onPress={onRetryMonth} />
                  </>
                )}
              </View>
            )}
            {data && error && (
              <Text accessibilityRole="alert" style={styles.warning}>
                Your activity may be out of date.{' '}
                <Retry label="Retry progress" onPress={onRetryMonth} />
              </Text>
            )}
            <View style={styles.weekdays}>
              {weekdays.map((name, index) => (
                <Text key={index} style={styles.weekday}>
                  {name}
                </Text>
              ))}
            </View>
            <View style={[styles.grid, !data && styles.unavailableCalendar]}>
              {cells.map((date, index) => {
                if (!date)
                  return (
                    <View key={`gap-${index}`} style={styles.cell}>
                      <View style={[styles.dayCircle, styles.placeholder]} />
                    </View>
                  );
                const count = counts.get(date) ?? 0;
                const active = !!data && count > 0;
                const today = date === data?.today;
                const selected = date === selectedDate;
                const future = !data || date > data.today;
                return (
                  <View
                    key={date}
                    testID={`calendar-cell-${date}`}
                    style={styles.cell}
                  >
                    {today && active && (
                      <Svg
                        width={52}
                        height={14}
                        viewBox="0 0 52 14"
                        pointerEvents="none"
                        style={styles.todayRays}
                      >
                        <Path
                          d="M1.5 9.5 7 12.2M9 1.4 11.6 7.2M43 1.4 40.4 7.2M50.5 9.5 45 12.2"
                          fill="none"
                          stroke="#F4A46C"
                          strokeWidth={1.3}
                          strokeLinecap="round"
                        />
                      </Svg>
                    )}
                    <Pressable
                      accessibilityRole={active ? 'button' : undefined}
                      accessibilityLabel={
                        data
                          ? `${dayLabel(date)}${today ? ', today' : ''}, ${count} ${count === 1 ? 'rep' : 'reps'}`
                          : `${dayLabel(date)}, activity unavailable`
                      }
                      accessibilityState={{
                        disabled: !active || future,
                        selected,
                      }}
                      disabled={!active || future}
                      onPress={() => onOpenDay(date)}
                      style={[
                        styles.dayCircle,
                        active ? styles.activeDay : styles.inactiveDay,
                        today && styles.today,
                        today && active && styles.todayActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNumber,
                          !active && styles.inactiveNumber,
                          active && styles.activeNumber,
                          today && active && styles.todayNumber,
                        ]}
                      >
                        {Number(date.slice(-2))}
                      </Text>
                      {active && (
                        <View testID={`rep-badge-${date}`} style={styles.badge}>
                          <Text style={styles.badgeText}>{count}</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                );
              })}
            </View>
            <View style={styles.monthSummary}>
              <Text style={styles.summaryNumber}>
                {data?.monthlyReps ?? '—'}
              </Text>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryHeading}>reps this month</Text>
                <Text style={styles.summarySub}>
                  on {data?.activeDays ?? '—'} active{' '}
                  {data?.activeDays === 1 ? 'day' : 'days'}
                </Text>
              </View>
              <View style={styles.legend}>
                <View style={styles.legendDot}>
                  <Text style={styles.legendBadgeText}>#</Text>
                </View>
                <Text style={styles.legendText}>
                  Small numbers{'\n'}show reps
                </Text>
              </View>
            </View>
          </View>
          {!!data && (
            <Text style={styles.instruction}>
              {data.totalReps === 0
                ? 'Your first completed challenge will appear here.'
                : data.monthlyReps
                  ? 'Tap an active day to see your challenges.'
                  : 'No completed challenges this month yet.'}
            </Text>
          )}
        </View>
      </ScrollView>
      <DaySheet
        key={selectedDate ?? 'closed'}
        date={selectedDate}
        day={day}
        loading={dayLoading}
        error={dayError}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onClose={onCloseDay}
        onRetry={onRetryDay}
        onLoadMore={onLoadMore}
      />
    </SafeAreaView>
  );
}

function Metric({
  icon,
  label,
  value,
  suffix,
}: {
  icon: 'streak' | 'best' | 'reps';
  label: string;
  value: number | null;
  suffix?: string;
}) {
  return (
    <View style={styles.metric}>
      <Svg
        width={icon === 'reps' ? 44 : 36}
        height={38}
        viewBox={icon === 'reps' ? '0 0 44 38' : '0 0 36 38'}
        testID={`progress-metric-icon-${icon}`}
        aria-hidden
      >
        {icon === 'streak' ? (
          <Path
            d="M18.23 3.70 C22.93 6.81 26.00 11.27 24.65 17.69 C26.46 16.11 27.53 14.53 28.69 13.23 C31.76 18.20 32.27 24.20 29.85 28.61 C28.27 31.49 25.44 33.91 22.32 35.07 C23.95 32.05 24.28 29.17 22.42 26.99 C21.81 27.64 20.93 28.24 20.28 28.43 C18.79 26.52 18.79 23.03 18.56 20.20 C15.35 22.10 12.00 25.08 11.26 28.10 C10.66 30.47 11.31 32.66 12.65 34.56 C8.28 32.56 5.31 28.43 5.31 23.92 C5.31 19.97 7.68 16.20 10.98 13.74 L11.45 16.34 C15.26 13.13 18.74 8.49 18.23 3.70 Z"
            fill="none"
            stroke={colors.ink}
            strokeWidth={1.65}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : icon === 'best' ? (
          <Path
            d="M9 4.5h18v11c0 7-4 11.5-9 11.5S9 22.5 9 15.5v-11Zm0 4H3.5v4c0 5 2.5 8 7.2 8m16.3-12h5.5v4c0 5-2.5 8-7.2 8M18 27v5m-7.5 3c.5-2.3 2.7-3 7.5-3s7 .7 7.5 3h-15Z"
            fill="none"
            stroke={colors.ink}
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            {/* Paper's silhouette is about 43 × 25 points, aligned at the bottom. */}
            <Rect
              x={1.5}
              y={21.1}
              width={2.6}
              height={4.2}
              rx={0.5}
              fill="none"
              stroke={colors.ink}
              strokeWidth={1.6}
            />
            <Rect
              x={4.1}
              y={15.2}
              width={4.1}
              height={16}
              rx={0.8}
              fill="none"
              stroke={colors.ink}
              strokeWidth={1.6}
            />
            <Rect
              x={8.2}
              y={11.5}
              width={5.4}
              height={23.5}
              rx={1.1}
              fill="none"
              stroke={colors.ink}
              strokeWidth={1.6}
            />
            <Rect
              x={13.6}
              y={21.1}
              width={16.8}
              height={4.2}
              fill="none"
              stroke={colors.ink}
              strokeWidth={1.6}
            />
            <Rect
              x={30.4}
              y={11.5}
              width={5.4}
              height={23.5}
              rx={1.1}
              fill="none"
              stroke={colors.ink}
              strokeWidth={1.6}
            />
            <Rect
              x={35.8}
              y={15.2}
              width={4.1}
              height={16}
              rx={0.8}
              fill="none"
              stroke={colors.ink}
              strokeWidth={1.6}
            />
            <Rect
              x={39.9}
              y={21.1}
              width={2.6}
              height={4.2}
              rx={0.5}
              fill="none"
              stroke={colors.ink}
              strokeWidth={1.6}
            />
          </>
        )}
      </Svg>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>
        {value ?? '—'}
        {value !== null && suffix && (
          <>
            {'\u2009'}
            <Text style={styles.metricSuffix}>{suffix}</Text>
          </>
        )}
      </Text>
    </View>
  );
}

function Retry({
  label,
  onPress,
}: {
  label: string;
  onPress?: (() => void) | undefined;
}) {
  if (!onPress) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={styles.retry}
    >
      <Text style={styles.retryText}>Retry</Text>
    </Pressable>
  );
}

function EntryClockIcon() {
  return (
    <Svg
      testID="entry-clock-icon"
      width={16}
      height={16}
      viewBox="0 0 16 16"
      aria-hidden
    >
      <Circle
        cx={8}
        cy={8}
        r={6.25}
        fill="none"
        stroke={entryMetaInk}
        strokeWidth={1.3}
      />
      <Path
        d="M8 4.2v4.2l2.7 1.8"
        fill="none"
        stroke={entryMetaInk}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function EntryStopwatchIcon() {
  return (
    <Svg
      testID="entry-stopwatch-icon"
      width={16}
      height={16}
      viewBox="0 0 16 16"
      aria-hidden
    >
      <Circle
        cx={8}
        cy={9.4}
        r={5.8}
        fill="none"
        stroke={entryMetaInk}
        strokeWidth={1.3}
      />
      <Path
        d="M5.9 1.2h4.2M8 1.2v2.3M13 4.5l1.1-1.1M8 6.2v3.2"
        fill="none"
        stroke={entryMetaInk}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function DaySheet({
  date,
  day,
  loading,
  error,
  hasMore,
  loadingMore,
  onClose,
  onRetry,
  onLoadMore,
}: {
  date: string | null;
  day?: Day | undefined;
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onClose: () => void;
  onRetry?: (() => void) | undefined;
  onLoadMore?: (() => void) | undefined;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [backdropVisible, setBackdropVisible] = useState(true);
  const { height } = useWindowDimensions();
  const [sheetOffset] = useState(() => new Animated.Value(height));
  const open = useCallback(() => {
    sheetOffset.setValue(height);
    Animated.timing(sheetOffset, {
      toValue: 0,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [height, sheetOffset]);
  const close = useCallback(() => {
    setBackdropVisible(false);
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
  }, [height, onClose, sheetOffset]);
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
  return (
    <Modal
      visible={date !== null}
      transparent
      animationType="none"
      onShow={open}
      onRequestClose={close}
      statusBarTranslucent
    >
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
          edges={['bottom']}
          style={[styles.sheet, { transform: [{ translateY: sheetOffset }] }]}
          accessibilityViewIsModal
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
          {date && (
            <Text accessibilityRole="header" style={styles.dayTitle}>
              {dayLabel(date)}
            </Text>
          )}
          {loading && !day ? (
            <View style={styles.state}>
              <ActivityIndicator
                accessibilityLabel="Loading day details"
                color={colors.ink}
              />
              <Text style={styles.stateText}>Loading this day…</Text>
            </View>
          ) : error && !day ? (
            <View style={styles.state}>
              <Text accessibilityRole="alert" style={styles.stateText}>
                We couldn’t load this day.
              </Text>
              <Retry label="Retry day details" onPress={onRetry} />
            </View>
          ) : day ? (
            <>
              <Text style={styles.daySummary}>
                {day.totalReps} {day.totalReps === 1 ? 'rep' : 'reps'} ·{' '}
                {durationLabel(day.totalElapsedSeconds)} total
              </Text>
              {error && (
                <Text accessibilityRole="alert" style={styles.warning}>
                  Some entries couldn’t load.{' '}
                  <Retry label="Retry day details" onPress={onRetry} />
                </Text>
              )}
              <ScrollView contentContainerStyle={styles.entries}>
                {day.entries.map((entry, index) => {
                  const opened = expanded === entry.attemptId;
                  const feeling =
                    entry.reflectionStatus === 'submitted'
                      ? entry.feeling
                      : null;
                  const reflection =
                    entry.reflectionStatus === 'submitted'
                      ? entry.reflectionText
                      : null;
                  return (
                    <Pressable
                      key={entry.attemptId}
                      accessibilityRole="button"
                      accessibilityLabel={`Rep ${index + 1}. ${entry.instruction}. ${completionTime(entry.completedAt, entry.timeZone)}. ${durationLabel(entry.elapsedSeconds)}. After: ${feelingLabel(feeling)}${reflection ? '. Saved reflection' : ''}`}
                      accessibilityState={{ expanded: opened }}
                      onPress={() =>
                        setExpanded(opened ? null : entry.attemptId)
                      }
                      style={styles.entry}
                    >
                      <Text style={styles.ordinal}>
                        {String(index + 1).padStart(2, '0')}
                      </Text>
                      <View style={styles.entryMain}>
                        <Text
                          numberOfLines={opened ? undefined : 2}
                          style={styles.entryTitle}
                        >
                          {entry.instruction}
                        </Text>
                        <View
                          testID="entry-metadata-row"
                          style={styles.entryMeta}
                        >
                          <View style={styles.entryMetaItem}>
                            <EntryClockIcon />
                            <Text style={styles.entryMetaText}>
                              {completionTime(
                                entry.completedAt,
                                entry.timeZone,
                              )}
                            </Text>
                          </View>
                          <View style={styles.entryMetaDivider} />
                          <View style={styles.entryMetaItem}>
                            <EntryStopwatchIcon />
                            <Text style={styles.entryMetaText}>
                              {durationLabel(entry.elapsedSeconds)}
                            </Text>
                          </View>
                        </View>
                        {opened && reflection && (
                          <View style={styles.reflection}>
                            <Text style={styles.reflectionLabel}>
                              Saved reflection
                            </Text>
                            <Text style={styles.reflectionText}>
                              {reflection}
                            </Text>
                          </View>
                        )}
                      </View>
                      <View testID="entry-feeling" style={styles.feeling}>
                        <Text style={styles.after}>After</Text>
                        {feeling ? (
                          <FeelingFace
                            feeling={feeling}
                            size={36}
                            selected={false}
                          />
                        ) : (
                          <Text style={styles.notRecorded}>
                            Not{'\n'}recorded
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
                {hasMore && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Load more challenges"
                    disabled={loadingMore}
                    accessibilityState={{ disabled: loadingMore }}
                    onPress={onLoadMore}
                    style={styles.more}
                  >
                    <Text style={styles.moreText}>
                      {loadingMore ? 'Loading…' : 'Load more challenges'}
                    </Text>
                  </Pressable>
                )}
              </ScrollView>
            </>
          ) : null}
        </AnimatedSafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: {
    width: '100%',
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: 15,
    paddingBottom: 32,
  },
  header: {
    alignSelf: 'center',
    paddingTop: 4,
    paddingBottom: 12,
  },
  card: {
    backgroundColor: '#FCF4EA',
    borderColor: '#E6D6C8',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  stats: {
    flexDirection: 'row',
    paddingVertical: 6,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E9D8CB',
  },
  metric: { flex: 1, alignItems: 'center', minWidth: 0, paddingBottom: 14 },
  metricLabel: {
    ...typography.caption,
    color: colors.ink,
    textAlign: 'center',
  },
  metricValue: {
    fontFamily: fontFamilies.editorial,
    fontSize: 28,
    color: colors.ink,
    fontWeight: '700',
    letterSpacing: -0.25,
    textAlign: 'center',
  },
  metricSuffix: {
    fontFamily: fontFamilies.editorial,
    fontSize: 28,
    letterSpacing: -0.15,
  },
  monthHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTitle: {
    fontFamily: fontFamilies.editorial,
    fontSize: 23,
    fontWeight: '700',
    letterSpacing: -0.25,
    color: colors.ink,
  },
  monthButtons: { flexDirection: 'row', gap: 2 },
  arrow: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontFamily: fontFamilies.display,
    color: colors.ink,
    fontSize: 37,
    lineHeight: 41,
  },
  weekdays: { flexDirection: 'row', marginTop: 6 },
  weekday: {
    width: '14.2857%',
    textAlign: 'center',
    color: '#87929B',
    fontFamily: fontFamilies.medium,
    fontSize: 11,
    lineHeight: 20,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingBottom: 12 },
  unavailableCalendar: { opacity: 0.45 },
  cell: {
    width: '14.2857%',
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
  },
  dayCircle: {
    width: 36,
    height: 36,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  placeholder: {
    backgroundColor: 'transparent',
    borderColor: '#BAC6CD',
    borderStyle: 'dashed',
  },
  activeDay: { backgroundColor: colors.white, borderColor: '#E6D9CE' },
  inactiveDay: { backgroundColor: '#EBDFD4', borderColor: '#DCCDC0' },
  today: { borderColor: '#F4A46C', borderWidth: 2 },
  todayActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
    borderWidth: 1,
  },
  todayRays: {
    position: 'absolute',
    top: -5,
    left: '50%',
    transform: [{ translateX: -26 }],
    zIndex: 1,
  },
  dayNumber: {
    color: colors.ink,
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  inactiveNumber: { color: '#77797B' },
  activeNumber: { transform: [{ translateY: -3 }] },
  todayNumber: { color: colors.cream },
  badge: {
    position: 'absolute',
    bottom: -5,
    minWidth: 20,
    height: 18,
    borderRadius: 10,
    backgroundColor: '#FFE2C8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: colors.ink,
    fontFamily: fontFamilies.semibold,
    fontSize: 10,
  },
  monthSummary: {
    borderTopWidth: 1,
    borderColor: '#E8D7C9',
    paddingTop: 11,
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryNumber: {
    color: colors.ink,
    fontFamily: fontFamilies.display,
    fontSize: 45,
    fontWeight: '600',
    marginRight: 12,
  },
  summaryCopy: { flex: 1 },
  summaryHeading: {
    color: colors.ink,
    fontFamily: fontFamilies.editorial,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: -0.15,
  },
  summarySub: {
    color: '#6C7D8D',
    fontFamily: fontFamilies.regular,
    fontSize: 12,
  },
  legend: {
    borderLeftWidth: 1,
    borderLeftColor: '#E9DDD2',
    paddingLeft: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    backgroundColor: '#FFE2C8',
    borderRadius: 18,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendBadgeText: {
    color: colors.ink,
    fontFamily: fontFamilies.semibold,
    fontSize: 16,
  },
  legendText: {
    color: '#7D8790',
    fontFamily: fontFamilies.regular,
    fontSize: 10,
    lineHeight: 14,
  },
  instruction: {
    ...typography.caption,
    color: colors.ink,
    textAlign: 'center',
    marginTop: 12,
  },
  state: { paddingVertical: 12, alignItems: 'center', gap: 4 },
  stateText: { ...typography.body, color: colors.ink, textAlign: 'center' },
  retry: {
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  retryText: {
    ...typography.label,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  warning: { ...typography.caption, color: colors.ink, paddingVertical: 8 },
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
  dayTitle: {
    fontFamily: fontFamilies.editorial,
    color: colors.ink,
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    paddingTop: 10,
    paddingRight: 35,
  },
  daySummary: {
    fontFamily: fontFamilies.regular,
    color: '#647895',
    fontSize: 15,
    marginTop: 12,
    marginBottom: 14,
  },
  entries: { paddingBottom: 24 },
  entry: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E8E3DE',
    minHeight: 73,
    paddingVertical: 12,
    gap: 9,
  },
  ordinal: {
    fontFamily: fontFamilies.display,
    fontSize: 17,
    color: '#5F7391',
    width: 30,
    transform: [{ translateY: 6 }],
  },
  entryMain: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: '#DDDAD5',
    paddingLeft: 12,
  },
  entryTitle: {
    fontFamily: fontFamilies.editorial,
    color: colors.ink,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.15,
    lineHeight: 22,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 17,
    marginTop: 7,
  },
  entryMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  entryMetaDivider: {
    width: 1,
    height: 15,
    backgroundColor: '#D8D8D8',
    marginHorizontal: 12,
    flexShrink: 0,
  },
  entryMetaText: {
    fontFamily: fontFamilies.regular,
    color: entryMetaInk,
    fontSize: 12,
    lineHeight: 17,
  },
  feeling: {
    width: 61,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  after: { fontFamily: fontFamilies.regular, color: '#7287A3', fontSize: 11 },
  notRecorded: {
    fontFamily: fontFamilies.regular,
    color: '#7287A3',
    fontSize: 9,
    textAlign: 'center',
  },
  reflection: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  reflectionLabel: { ...typography.caption, color: '#7287A3' },
  reflectionText: { ...typography.body, color: colors.ink, marginTop: 4 },
  more: { minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  moreText: {
    ...typography.label,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
});
