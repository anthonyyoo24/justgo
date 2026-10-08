import { useEffect, useRef, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { Text } from 'react-native';
import {
  useActivityState,
  useRuntime,
} from '../../app-support/providers/AppProvider';
import { SavingSheetSurface } from '../../app-support/saving/SavingFeedback';
import type { AccountRepository } from '../../data/activity/repository';
import {
  progressCalendar,
  progressDay,
  progressMetrics,
} from '../../data/activity/progress/progress';
import { useProgressReads } from '../../data/activity/progress/useProgressReads';
import { moveMonth } from './calendar';
import { ProgressView } from './ProgressView';
import { displayEntry } from './types';
import { useDayReflection } from './day-details/useDayReflection';

export function ProgressScreen() {
  const { repository } = useActivityState();
  return repository ? (
    <AccountProgress key={repository.accountId} repository={repository} />
  ) : (
    <Text>Connect your account to view Progress.</Text>
  );
}
function AccountProgress({ repository }: { repository: AccountRepository }) {
  const { client } = useRuntime();
  const { state } = useActivityState();
  const focused = useIsFocused();
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
  const reads = useProgressReads(
    client,
    repository,
    state,
    month,
    selectedDate,
    focused,
  );
  const reflection = useDayReflection(repository);
  const metrics = progressMetrics(state!);
  const calendar = progressCalendar(state!, month, reads.calendar.data);
  const pages = reads.day.data?.pages;
  const remoteDay = pages?.length
    ? {
        ...pages[0]!,
        entries: pages.flatMap((page) => page.entries),
        nextCursor: pages.at(-1)!.nextCursor,
      }
    : undefined;
  const day = selectedDate
    ? progressDay(state!, selectedDate, remoteDay)
    : undefined;
  const editingAttempt = reflection.editingId
    ? repository.getAttempt(reflection.editingId)
    : undefined;
  // An in-progress editor keeps its accepted text when connectivity changes;
  // closing it returns older-day lookups to the connection-required state.
  const shownDay =
    day ??
    (editingAttempt && selectedDate
      ? { date: selectedDate, totalReps: 1, entries: [editingAttempt] }
      : undefined);
  const online = state!.online;
  return (
    <ProgressView
      sheetAccessory={
        selectedDate ? (
          <>
            <SavingSheetSurface
              onLeave={() =>
                reflection.beforeClose(() => setSelectedDate(null))
              }
            />
            {reflection.error && (
              <Text accessibilityRole="alert">{reflection.error}</Text>
            )}
          </>
        ) : undefined
      }
      month={month}
      data={
        metrics || calendar
          ? {
              month,
              today: state!.period.today,
              totalReps: metrics?.totalReps ?? null,
              currentStreak: metrics?.currentStreak ?? null,
              bestStreak: metrics?.bestStreak ?? null,
              monthlyReps: calendar?.monthlyReps ?? null,
              activeDays: calendar?.activeDays ?? null,
              days: calendar?.days,
            }
          : undefined
      }
      summaryLoading={!metrics && online && reads.summary.isPending}
      summaryError={!metrics && online && reads.summary.isError}
      loading={!calendar && online && !reads.calendar.isError}
      updatingMonth={!calendar && reads.calendar.isFetching}
      error={!calendar && reads.calendar.isError}
      connectionRequired={!calendar && !online}
      selectedDate={selectedDate}
      day={
        shownDay
          ? { ...shownDay, entries: shownDay.entries.map(displayEntry) }
          : undefined
      }
      dayLoading={reads.day.isPending && online}
      dayError={reads.day.isError && !shownDay}
      dayConnectionRequired={!online && !!selectedDate && !shownDay}
      loadMoreError={online && reads.day.isFetchNextPageError}
      hasMore={online && reads.day.hasNextPage}
      loadingMore={reads.day.isFetchingNextPage}
      fetchingDay={reads.day.isFetching}
      paginationKey={pages?.at(-1)?.nextCursor}
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
      onRetryMonth={() => {
        void reads.calendar.refetch();
        void reads.summary.refetch();
      }}
      onRetryDay={() =>
        void (reads.day.isFetchNextPageError
          ? reads.day.fetchNextPage()
          : reads.day.refetch())
      }
      onLoadMore={() => {
        if (reads.day.hasNextPage && !reads.day.isFetching)
          void reads.day.fetchNextPage();
      }}
    />
  );
}
