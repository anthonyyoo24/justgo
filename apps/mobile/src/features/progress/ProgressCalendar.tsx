import { useMemo } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import type { LegacyProgressResponse as ProgressResponse } from '@justgo/contracts';
import { ScreenHeader } from '../../components/ScreenHeader';
import { challengeScale } from '../challenges/challenge-design';
import { colors, fontFamilies, layout, typography } from '../../theme/tokens';
import { ProgressSkeleton, useProgressShimmer } from './ProgressSkeleton';
import { calendarCells, dayLabel, monthLabel } from './calendar';
export type ProgressCalendarProps = {
  month: string;
  data?: ProgressResponse | undefined;
  loading?: boolean;
  updatingMonth?: boolean;
  error?: boolean;
  selectedDate: string | null;
  onMonth: (offset: number) => void;
  onOpenDay: (date: string) => void;
  onRetryMonth?: (() => void) | undefined;
};
const weekdays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export function ProgressCalendar({
  month,
  data,
  loading = false,
  updatingMonth = false,
  error = false,
  selectedDate,
  onMonth,
  onOpenDay,
  onRetryMonth,
}: ProgressCalendarProps) {
  const { width } = useWindowDimensions();
  const headerScale = challengeScale(width);
  const cells = useMemo(() => calendarCells(month), [month]);
  const skeletonLoading = !data && loading && !error;
  const shimmer = useProgressShimmer(skeletonLoading);
  const counts = useMemo(
    () => new Map(data?.days.map((item) => [item.date, item.reps]) ?? []),
    [data],
  );

  return (
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
        <View
          testID="progress-calendar-card"
          style={styles.card}
          accessibilityLabel={skeletonLoading ? 'Loading progress' : undefined}
          accessibilityState={{ busy: skeletonLoading }}
        >
          <View style={styles.stats}>
            <Metric
              icon="streak"
              label="Current streak"
              value={data?.currentStreak ?? null}
              suffix="days"
              loading={skeletonLoading}
              shimmer={shimmer}
            />
            <Metric
              icon="best"
              label="Best streak"
              value={data?.bestStreak ?? null}
              suffix="days"
              loading={skeletonLoading}
              shimmer={shimmer}
            />
            <Metric
              icon="reps"
              label="Total reps"
              value={data?.totalReps ?? null}
              loading={skeletonLoading}
              shimmer={shimmer}
            />
          </View>
          <View style={styles.monthHeader}>
            <Text accessibilityRole="header" style={styles.monthTitle}>
              {monthLabel(month)}
            </Text>
            <View style={styles.monthButtons}>
              {updatingMonth && (
                <ActivityIndicator
                  accessibilityLabel="Loading month"
                  color={colors.ink}
                  size="small"
                />
              )}
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
          {!data && !skeletonLoading && (
            <View style={styles.state}>
              <Text accessibilityRole="alert" style={styles.stateText}>
                We couldn’t load your progress.
              </Text>
              <Retry label="Retry progress" onPress={onRetryMonth} />
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
          <View
            testID="progress-calendar-grid"
            style={[
              styles.grid,
              !data && !skeletonLoading && styles.unavailableCalendar,
            ]}
          >
            {cells.map((date, index) => {
              if (skeletonLoading)
                return (
                  <View key={date ?? `gap-${index}`} style={styles.cell}>
                    <ProgressSkeleton
                      testID="progress-calendar-skeleton"
                      animation={shimmer}
                      style={styles.calendarSkeleton}
                    />
                  </View>
                );
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
                  {today && (
                    <Svg
                      width={52}
                      height={14}
                      viewBox="0 0 52 14"
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
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayNumber,
                        !active && styles.inactiveNumber,
                        active && styles.activeNumber,
                        today && styles.todayNumber,
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
            {skeletonLoading ? (
              <View style={styles.summaryNumberSlot}>
                <Text
                  aria-hidden
                  style={[
                    styles.summaryNumber,
                    styles.sizingText,
                    { marginRight: 0 },
                  ]}
                >
                  00
                </Text>
                <ProgressSkeleton
                  testID="progress-month-reps-skeleton"
                  animation={shimmer}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            ) : (
              <Text style={styles.summaryNumber}>
                {data?.monthlyReps ?? '—'}
              </Text>
            )}
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryHeading}>reps this month</Text>
              {skeletonLoading ? (
                <View style={styles.activeDaysLoading}>
                  <Text style={styles.summarySub}>on </Text>
                  <View>
                    <Text
                      aria-hidden
                      style={[styles.summarySub, styles.sizingText]}
                    >
                      00
                    </Text>
                    <ProgressSkeleton
                      testID="progress-active-days-skeleton"
                      animation={shimmer}
                      style={StyleSheet.absoluteFill}
                    />
                  </View>
                  <Text style={styles.summarySub}> active days</Text>
                </View>
              ) : (
                <Text style={styles.summarySub}>
                  on {data?.activeDays ?? '—'} active{' '}
                  {data?.activeDays === 1 ? 'day' : 'days'}
                </Text>
              )}
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
        {(!!data || skeletonLoading) && (
          <Text style={styles.instruction}>
            {skeletonLoading
              ? 'Tap an active day to see your challenges'
              : data!.totalReps === 0
                ? 'Your first completed challenge will appear here.'
                : data!.monthlyReps
                  ? 'Tap an active day to see your challenges'
                  : 'No completed challenges this month yet.'}
          </Text>
        )}
      </View>
    </ScrollView>
  );
}
function Metric({
  icon,
  label,
  value,
  suffix,
  loading,
  shimmer,
}: {
  icon: 'streak' | 'best' | 'reps';
  label: string;
  value: number | null;
  suffix?: string;
  loading: boolean;
  shimmer: Animated.Value | null;
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
      {loading ? (
        <View>
          <Text aria-hidden style={[styles.metricValue, styles.sizingText]}>
            {suffix ? `0\u2009${suffix}` : '00'}
          </Text>
          <ProgressSkeleton
            testID={`progress-metric-skeleton-${icon}`}
            animation={shimmer}
            style={StyleSheet.absoluteFill}
          />
        </View>
      ) : (
        <Text style={styles.metricValue}>
          {value ?? '—'}
          {value !== null && suffix && (
            <>
              {'\u2009'}
              <Text style={styles.metricSuffix}>{suffix}</Text>
            </>
          )}
        </Text>
      )}
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

const styles = StyleSheet.create({
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
  calendarSkeleton: { width: 36, height: 36, borderRadius: 20 },
  sizingText: { opacity: 0 },
  summaryNumberSlot: { marginRight: 12 },
  activeDaysLoading: { flexDirection: 'row', alignItems: 'center' },
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
  today: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
    borderWidth: 1,
  },
  todayRays: {
    pointerEvents: 'none',
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
});
