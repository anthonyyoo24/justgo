import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  feelingChoices,
  type FeelingCode,
  type ProgressEntry,
  type ProgressResponse,
} from '@justgo/contracts';
import { Link } from 'expo-router';
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
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              Progress
            </Text>
            <Link
              href="/settings"
              accessibilityLabel="Open Settings"
              style={styles.settings}
            >
              <Svg width={27} height={27} viewBox="0 0 27 27" aria-hidden>
                <Circle
                  cx={13.5}
                  cy={13.5}
                  r={11.5}
                  fill="none"
                  stroke={colors.ink}
                  strokeWidth={1.5}
                />
                <Circle
                  cx={13.5}
                  cy={10}
                  r={3.2}
                  fill="none"
                  stroke={colors.ink}
                  strokeWidth={1.3}
                />
                <Path
                  d="M6.5 21c.4-4.3 3-6.2 7-6.2s6.6 1.9 7 6.2"
                  fill="none"
                  stroke={colors.ink}
                  strokeWidth={1.3}
                />
              </Svg>
            </Link>
          </View>
          <View style={styles.card}>
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
                  <View key={date} style={styles.cell}>
                    {today && active && (
                      <Svg
                        width={60}
                        height={16}
                        viewBox="0 0 60 16"
                        pointerEvents="none"
                        style={styles.todayRays}
                      >
                        <Path
                          d="M7 13 2 9M10 7 8 1m42 6 2-6m1 12 5-4"
                          fill="none"
                          stroke="#F4A46C"
                          strokeWidth={1.5}
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
                        selected && styles.selectedDay,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNumber,
                          active && styles.activeNumber,
                          today && active && styles.todayNumber,
                          selected && styles.selectedText,
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
                  <Text style={styles.badgeText}>#</Text>
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
      <Svg width={35} height={38} viewBox="0 0 36 38" aria-hidden>
        {icon === 'streak' ? (
          <Path
            d="M18 4c-1 5-9 8-10 17-1 7 3 12 10 13 7-1 11-6 10-13-1-5-4-9-5-11-1 4-3 5-5 6 1-4 1-8 0-12Zm-1 17c-1 3-4 5-4 8 0 3 2 5 5 5s5-2 5-5c0-3-2-5-3-7-1 2-2 3-3 3v-4Z"
            fill="none"
            stroke={colors.ink}
            strokeWidth={1.7}
            strokeLinejoin="round"
          />
        ) : icon === 'best' ? (
          <Path
            d="M10 6h16v11c0 7-4 11-8 11s-8-4-8-11V6Zm0 3H4v4c0 5 3 8 7 8m15-12h6v4c0 5-3 8-7 8M18 28v5m-8 1h16"
            fill="none"
            stroke={colors.ink}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <Path
            d="M4 13v12m3-15v18m4-18v18m3-12h8m3-6v18m4-18v18m3-15v12M4 13h3m-3 12h3m22-12h3m-3 12h3"
            fill="none"
            stroke={colors.ink}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        )}
      </Svg>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>
        {value ?? '—'}
        {value !== null && suffix && (
          <Text style={styles.metricSuffix}> {suffix}</Text>
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
  const close = () => {
    setExpanded(null);
    onClose();
  };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dy > 12 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dy > 90 || gesture.vy > 0.8) {
            setExpanded(null);
            onClose();
          }
        },
      }),
    [onClose],
  );
  return (
    <Modal
      visible={date !== null}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View style={styles.modalRoot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close day details"
          onPress={close}
          style={styles.backdrop}
        />
        <SafeAreaView
          edges={['bottom']}
          style={styles.sheet}
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
                        <Text style={styles.entryMeta}>
                          ◷ {completionTime(entry.completedAt, entry.timeZone)}{' '}
                          │ ◴ {durationLabel(entry.elapsedSeconds)}
                        </Text>
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
                      <View style={styles.feeling}>
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
        </SafeAreaView>
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
  header: { height: 62, justifyContent: 'center', alignItems: 'center' },
  title: { fontFamily: fontFamilies.display, fontSize: 31, color: colors.ink },
  settings: {
    position: 'absolute',
    right: 2,
    top: 7,
    width: 44,
    height: 44,
    textAlign: 'center',
    paddingTop: 8,
  },
  card: {
    backgroundColor: '#FFF7EF',
    borderColor: '#ECDDD1',
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
  },
  stats: {
    flexDirection: 'row',
    paddingVertical: 6,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EDE1D7',
  },
  metric: { flex: 1, alignItems: 'center', minWidth: 0, paddingBottom: 14 },
  metricLabel: {
    ...typography.caption,
    color: colors.ink,
    textAlign: 'center',
  },
  metricValue: {
    fontFamily: fontFamilies.display,
    fontSize: 28,
    color: colors.ink,
    fontWeight: '600',
    textAlign: 'center',
  },
  metricSuffix: { fontFamily: fontFamilies.display, fontSize: 19 },
  monthHeader: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthTitle: {
    fontFamily: fontFamilies.display,
    fontSize: 23,
    fontWeight: '600',
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
    height: 43,
  },
  dayCircle: {
    width: 38,
    height: 38,
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
  activeDay: { backgroundColor: colors.white, borderColor: '#EEE2D8' },
  inactiveDay: { backgroundColor: '#E9E3DC', borderColor: '#E8DED5' },
  today: { borderColor: '#F4A46C', borderWidth: 2 },
  todayActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  todayRays: {
    position: 'absolute',
    top: -7,
    left: '50%',
    transform: [{ translateX: -30 }],
    zIndex: 1,
  },
  selectedDay: { backgroundColor: colors.ink, borderColor: colors.ink },
  dayNumber: {
    color: colors.ink,
    fontFamily: fontFamilies.medium,
    fontSize: 12,
    lineHeight: 16,
  },
  activeNumber: { transform: [{ translateY: -7 }] },
  todayNumber: { color: colors.cream },
  selectedText: { color: colors.white },
  badge: {
    position: 'absolute',
    bottom: -7,
    minWidth: 20,
    height: 20,
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
    borderColor: '#E9DDD2',
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
    fontFamily: fontFamilies.display,
    fontWeight: '600',
    fontSize: 16,
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
    fontFamily: fontFamilies.display,
    color: colors.ink,
    fontSize: 30,
    fontWeight: '600',
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
  },
  entryMain: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: '#DDDAD5',
    paddingLeft: 12,
  },
  entryTitle: {
    fontFamily: fontFamilies.display,
    color: colors.ink,
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 20,
  },
  entryMeta: {
    fontFamily: fontFamilies.regular,
    color: '#7287A3',
    fontSize: 12,
    marginTop: 8,
  },
  feeling: { width: 61, alignItems: 'center' },
  after: { fontFamily: fontFamilies.regular, color: '#7287A3', fontSize: 11 },
  notRecorded: {
    fontFamily: fontFamilies.regular,
    color: '#7287A3',
    fontSize: 9,
    textAlign: 'center',
    marginTop: 3,
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
