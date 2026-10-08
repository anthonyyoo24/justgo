import { useEffect, useRef, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProgressView } from '../../features/progress/ProgressView';
import { moveMonth } from '../../features/progress/calendar';
import { DeckPreview } from '../../features/challenges/DeckPreview';
import { SuccessView } from '../../features/challenges/SuccessView';
import { ReflectionView } from '../../features/reflections/ReflectionView';
import type { FeelingCode } from '@justgo/contracts';
import type {
  ProgressEntry,
  ProgressDisplay as ProgressResponse,
} from '../../features/progress/types';
import { NavigationIcon } from '../../components/NavigationIcon';
import { colors, spacing, typography } from '../../theme/tokens';
const previewEntries: ProgressEntry[] = [
  {
    attemptId: '00000000-0000-4000-8000-000000000001',
    startedAt: '2026-09-18T13:15:00.000Z',
    timeZone: 'America/Toronto',
    instruction: 'Say hello to someone',
    reflectionStatus: 'submitted',
    feeling: 'about_the_same',
    reflectionText: 'I felt more at ease with each try.',
  },
  {
    attemptId: '00000000-0000-4000-8000-000000000002',
    startedAt: '2026-09-18T16:40:00.000Z',
    timeZone: 'America/Toronto',
    instruction: 'Ask for a recommendation',
    reflectionStatus: 'none',
    feeling: null,
    reflectionText: null,
  },
  {
    attemptId: '00000000-0000-4000-8000-000000000003',
    startedAt: '2026-09-18T22:10:00.000Z',
    timeZone: 'America/Toronto',
    instruction: 'Say hello to someone',
    reflectionStatus: 'submitted',
    feeling: 'a_little_better',
    reflectionText: 'Saying hello felt easier the second time.',
  },
];
const previewPagedEntries: ProgressEntry[] = [
  ...previewEntries,
  ...[
    ['Take a short walk', '2026-09-19T00:22:00.000Z'],
    ['Compliment someone', '2026-09-19T01:03:00.000Z'],
    ['Send a thank you note', '2026-09-19T01:28:00.000Z'],
  ].map(([instruction, startedAt], index) => ({
    ...previewEntries[index]!,
    attemptId: `preview-page-two-${index}`,
    instruction: instruction!,
    startedAt: startedAt!,
    reflectionStatus: 'none' as const,
    feeling: null,
    reflectionText: null,
  })),
];
const previewMonth: ProgressResponse = {
  month: '2026-09',
  today: '2026-09-18',
  currentStreak: 7,
  bestStreak: 12,
  totalReps: 63,
  monthlyReps: 21,
  activeDays: 12,
  days: [
    [1, 2],
    [3, 1],
    [5, 2],
    [8, 1],
    [10, 2],
    [12, 1],
    [13, 2],
    [14, 1],
    [15, 3],
    [16, 1],
    [17, 2],
    [18, 3],
  ].map(([day, reps]) => ({
    date: `2026-09-${String(day).padStart(2, '0')}`,
    reps: reps!,
  })),
};
const emptyMonth: ProgressResponse = {
  ...previewMonth,
  currentStreak: 0,
  bestStreak: 0,
  totalReps: 0,
  monthlyReps: 0,
  activeDays: 0,
  days: [],
};
// Presentation fixtures only. No API, account impersonation, or entitlement override.
export function ScreenPreview({
  progressState = 'default',
  progressDayState = 'default',
}: {
  progressState?: 'default' | 'empty' | 'error' | 'loading' | 'syncing';
  progressDayState?:
    | 'default'
    | 'offline'
    | 'initial-error'
    | 'load-more-error'
    | 'loading-more';
}) {
  const [tab, setTab] = useState<'home' | 'progress'>('home');
  const [progressMonth, setProgressMonth] = useState('2026-09');
  const [progressDay, setProgressDay] = useState<string | null>(null);
  const [dayState, setDayState] = useState<typeof progressDayState | 'loaded'>(
    progressDayState,
  );
  const [progressError, setProgressError] = useState(progressState === 'error');
  const [progressLoading, setProgressLoading] = useState(
    progressState === 'loading',
  );
  const [progressSyncing, setProgressSyncing] = useState(
    progressState === 'syncing',
  );
  const [step, setStep] = useState<'deck' | 'success' | 'reflection'>('deck');
  const [feeling, setFeeling] = useState<FeelingCode | null>(null);
  const [reflection, setReflection] = useState('');
  const [dismissOpen, setDismissOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (submitTimer.current) clearTimeout(submitTimer.current);
    },
    [],
  );
  if (!__DEV__) return <Redirect href="/" />;
  if (step === 'success')
    return <SuccessView onContinue={() => setStep('reflection')} />;
  if (step === 'reflection') {
    const done = () => {
      setStep('deck');
      setFeeling(null);
      setReflection('');
      setDismissOpen(false);
      setSubmitting(false);
    };
    return (
      <ReflectionView
        feeling={feeling}
        text={reflection}
        onFeelingChange={setFeeling}
        onTextChange={setReflection}
        onSubmit={() => {
          if (!feeling && !reflection.trim()) {
            done();
            return;
          }
          setSubmitting(true);
          submitTimer.current = setTimeout(() => {
            submitTimer.current = null;
            done();
          }, 1200);
        }}
        onClose={() =>
          feeling || reflection.trim() ? setDismissOpen(true) : done()
        }
        dismissOpen={dismissOpen}
        busy={submitting}
        savingVisible={submitting}
        onKeepEditing={() => setDismissOpen(false)}
        onDiscard={done}
      />
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <SafeAreaView edges={['top']} style={styles.notice}>
        <Text style={styles.note}>SCREEN PREVIEW · No activity is saved</Text>
        <Link href="/" replace style={styles.close}>
          Exit preview
        </Link>
        {progressState === 'loading' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              progressLoading
                ? 'Show loaded progress'
                : 'Replay progress loading'
            }
            onPress={() => setProgressLoading((current) => !current)}
            style={styles.close}
          >
            <Text style={styles.note}>
              {progressLoading
                ? 'Show loaded progress'
                : 'Replay progress loading'}
            </Text>
          </Pressable>
        )}
        {progressState === 'syncing' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              progressSyncing
                ? 'Show loaded progress'
                : 'Replay progress syncing'
            }
            onPress={() => setProgressSyncing((current) => !current)}
            style={styles.close}
          >
            <Text style={styles.note}>
              {progressSyncing
                ? 'Show loaded progress'
                : 'Replay progress syncing'}
            </Text>
          </Pressable>
        )}
      </SafeAreaView>
      {tab === 'home' ? (
        <DeckPreview insetTop={false} onCompleted={() => setStep('success')} />
      ) : (
        <ProgressView
          insetTop={false}
          month={progressMonth}
          data={
            progressError || progressLoading
              ? undefined
              : progressSyncing
                ? {
                    ...previewMonth,
                    month: progressMonth,
                    monthlyReps: null,
                    activeDays: null,
                    days: undefined,
                  }
                : progressState === 'empty'
                  ? { ...emptyMonth, month: progressMonth }
                  : progressMonth === '2026-09'
                    ? previewMonth
                    : {
                        ...previewMonth,
                        month: progressMonth,
                        monthlyReps: 0,
                        activeDays: 0,
                        days: [],
                      }
          }
          error={progressError}
          loading={progressLoading}
          waitingForSync={progressSyncing}
          selectedDate={progressDay}
          day={
            progressDay &&
            dayState !== 'initial-error' &&
            dayState !== 'offline'
              ? {
                  date: progressDay,
                  totalReps: dayState === 'default' ? 3 : 12,
                  entries:
                    dayState === 'default'
                      ? previewEntries
                      : previewPagedEntries,
                }
              : undefined
          }
          dayError={progressDay !== null && dayState === 'initial-error'}
          dayConnectionRequired={progressDay !== null && dayState === 'offline'}
          loadMoreError={progressDay !== null && dayState === 'load-more-error'}
          loadingMore={progressDay !== null && dayState === 'loading-more'}
          fetchingDay={progressDay !== null && dayState === 'loading-more'}
          hasMore={
            progressDay !== null &&
            (dayState === 'load-more-error' || dayState === 'loading-more')
          }
          onMonth={(offset) => {
            setProgressDay(null);
            setProgressMonth((month) => moveMonth(month, offset));
          }}
          onOpenDay={(date) => {
            setDayState(progressDayState);
            setProgressDay(date);
          }}
          onCloseDay={() => setProgressDay(null)}
          onRetryMonth={() => setProgressError(false)}
          onRetryDay={() =>
            setDayState(dayState === 'initial-error' ? 'default' : 'loaded')
          }
        />
      )}
      <SafeAreaView edges={['bottom']} style={styles.nav}>
        <View style={styles.row}>
          {(['home', 'progress'] as const).map((name) => (
            <Pressable
              key={name}
              accessibilityRole="tab"
              aria-selected={tab === name}
              accessibilityLabel={name === 'home' ? 'Home' : 'Progress'}
              accessibilityState={{ selected: tab === name }}
              onPress={() => setTab(name)}
              style={styles.tab}
            >
              <NavigationIcon
                name={name}
                color={tab === name ? colors.white : colors.border}
                active={tab === name}
              />
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </View>
  );
}
const styles = StyleSheet.create({
  notice: {
    backgroundColor: colors.peach,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    alignItems: 'center',
  },
  note: { ...typography.caption, color: colors.ink },
  close: {
    ...typography.caption,
    textDecorationLine: 'underline',
    color: colors.ink,
    minHeight: 44,
    padding: spacing.md,
  },
  nav: { backgroundColor: colors.navy },
  row: { flexDirection: 'row' },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
});
