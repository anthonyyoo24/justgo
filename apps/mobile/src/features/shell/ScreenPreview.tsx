import { useEffect, useRef, useState } from 'react';
import { Link, Redirect } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ProgressView } from '../progress/ProgressView';
import { moveMonth } from '../progress/calendar';
import { DeckPreview } from '../challenges/DeckPreview';
import { SuccessView } from '../challenges/SuccessView';
import { ReflectionView } from '../reflections/ReflectionView';
import type {
  FeelingCode,
  ProgressEntry,
  ProgressResponse,
} from '@justgo/contracts';
import { NavigationIcon } from '../../components/NavigationIcon';
import { colors, spacing, typography } from '../../theme/tokens';
const previewEntries: ProgressEntry[] = [
  {
    attemptId: '00000000-0000-4000-8000-000000000001',
    completedAt: '2026-09-18T13:15:00.000Z',
    timeZone: 'America/Toronto',
    elapsedSeconds: 122,
    cardId: 'preview-card-1',
    venue: 'streets',
    challengeId: 'preview-challenge-1',
    revisionId: 'preview-revision-1',
    levelId: 'level-1',
    instruction: 'Say hello to someone',
    feelingVersion: 1,
    reflectionStatus: 'submitted',
    feeling: 'about_the_same',
    reflectionText: 'I felt more at ease with each try.',
  },
  {
    attemptId: '00000000-0000-4000-8000-000000000002',
    completedAt: '2026-09-18T16:40:00.000Z',
    timeZone: 'America/Toronto',
    elapsedSeconds: 302,
    cardId: 'preview-card-2',
    venue: 'streets',
    challengeId: 'preview-challenge-2',
    revisionId: 'preview-revision-2',
    levelId: 'level-1',
    instruction: 'Ask for a recommendation',
    feelingVersion: 1,
    reflectionStatus: 'skipped',
    feeling: null,
    reflectionText: null,
  },
  {
    attemptId: '00000000-0000-4000-8000-000000000003',
    completedAt: '2026-09-18T22:10:00.000Z',
    timeZone: 'America/Toronto',
    elapsedSeconds: 185,
    cardId: 'preview-card-3',
    venue: 'park',
    challengeId: 'preview-challenge-3',
    revisionId: 'preview-revision-3',
    levelId: 'level-1',
    instruction: 'Say hello to someone',
    feelingVersion: 1,
    reflectionStatus: 'submitted',
    feeling: 'a_little_better',
    reflectionText: 'Saying hello felt easier the second time.',
  },
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
  simulateSkipFailure = false,
  progressState = 'default',
}: {
  simulateSkipFailure?: boolean;
  progressState?: 'default' | 'empty' | 'error';
}) {
  const [tab, setTab] = useState<'home' | 'progress'>('home');
  const [progressMonth, setProgressMonth] = useState('2026-09');
  const [progressDay, setProgressDay] = useState<string | null>(null);
  const [progressError, setProgressError] = useState(progressState === 'error');
  const [step, setStep] = useState<'deck' | 'success' | 'reflection'>('deck');
  const [feeling, setFeeling] = useState<FeelingCode | null>(null);
  const [reflection, setReflection] = useState('');
  const [dismissOpen, setDismissOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState<'skip' | null>(null);
  const [error, setError] = useState<string | null>(null);
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
      setPendingAction(null);
      setError(null);
    };
    return (
      <ReflectionView
        feeling={feeling}
        text={reflection}
        onFeelingChange={setFeeling}
        onTextChange={setReflection}
        onSubmit={() => {
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
        locked={pendingAction !== null}
        pendingAction={pendingAction}
        error={error}
        onKeepEditing={() => setDismissOpen(false)}
        onDiscard={() => {
          if (simulateSkipFailure) {
            setDismissOpen(false);
            setPendingAction('skip');
            setError('Couldn’t skip. Retry to leave safely.');
          } else done();
        }}
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
      </SafeAreaView>
      {tab === 'home' ? (
        <DeckPreview insetTop={false} onCompleted={() => setStep('success')} />
      ) : (
        <ProgressView
          insetTop={false}
          month={progressMonth}
          data={
            progressError
              ? undefined
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
          selectedDate={progressDay}
          day={
            progressDay
              ? {
                  date: progressDay,
                  totalReps: 3,
                  totalElapsedSeconds: 609,
                  entries: previewEntries,
                }
              : undefined
          }
          onMonth={(offset) => {
            setProgressDay(null);
            setProgressMonth((month) => moveMonth(month, offset));
          }}
          onOpenDay={setProgressDay}
          onCloseDay={() => setProgressDay(null)}
          onRetryMonth={() => setProgressError(false)}
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
