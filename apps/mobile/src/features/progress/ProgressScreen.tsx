import { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { useActivityState } from '../../app-support/providers/AppProvider';
import { SavingSheetSurface } from '../../app-support/saving/SavingFeedback';
import type { AccountRepository } from '../../data/activity/repository';
import {
  progressCalendar,
  progressDay,
  progressMetrics,
} from '../../data/activity/progress/progress';
import { moveMonth } from './calendar-dates';
import { ProgressView } from './ProgressView';
import { displayEntry } from './types';
import { useDayReflection } from './day-details/reflection-editor/useDayReflection';

export function ProgressScreen() {
  const { repository } = useActivityState();
  return repository ? (
    <AccountProgress key={repository.accountId} repository={repository} />
  ) : (
    <Text>Connect your account to view Progress.</Text>
  );
}
function AccountProgress({ repository }: { repository: AccountRepository }) {
  const { state } = useActivityState();
  const currentMonth = state!.period.today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const previousMonth = useRef(currentMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  useEffect(() => {
    const previous = previousMonth.current;
    previousMonth.current = currentMonth;
    if (previous !== currentMonth)
      setMonth((current) => (current === previous ? currentMonth : current));
  }, [currentMonth]);
  const reflection = useDayReflection(repository);
  const metrics = progressMetrics(state!);
  const calendar = progressCalendar(state!, month);
  const shownDay = selectedDate ? progressDay(state!, selectedDate) : undefined;
  return (
    <ProgressView
      sheetAccessory={
        selectedDate ? (
          <>
            <SavingSheetSurface
              onLeave={(proceed) =>
                reflection.beforeClose(() => {
                  setSelectedDate(null);
                  proceed();
                })
              }
            />
            {reflection.error && (
              <Text accessibilityRole="alert">{reflection.error}</Text>
            )}
          </>
        ) : undefined
      }
      journalDates={Object.values(state!.localEntries ?? {}).map(
        (entry) => entry.activityDate,
      )}
      month={month}
      data={{
        month,
        today: state!.period.today,
        totalReps: metrics.totalReps,
        currentStreak: metrics.currentStreak,
        bestStreak: metrics.bestStreak,
        monthlyReps: calendar.monthlyReps,
        activeDays: calendar.activeDays,
        days: calendar.days,
      }}
      selectedDate={selectedDate}
      day={
        shownDay
          ? { ...shownDay, entries: shownDay.entries.map(displayEntry) }
          : undefined
      }
      editingId={reflection.editingId}
      editor={reflection.editor}
      onEditorOpened={reflection.onEditorOpened}
      beforeClose={reflection.beforeClose}
      onEditReflection={(id) => {
        const attempt = shownDay?.entries.find((entry) => entry.id === id);
        if (attempt) reflection.edit(attempt);
      }}
      onMonth={(offset) =>
        reflection.beforeClose(() => {
          setSelectedDate(null);
          setMonth((current) => moveMonth(current, offset));
        })
      }
      onOpenDay={setSelectedDate}
      onCloseDay={() => setSelectedDate(null)}
    />
  );
}
