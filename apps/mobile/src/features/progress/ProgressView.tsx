import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/tokens';
import { DaySheet, type ProgressDay } from './day-details/DaySheet';
import {
  ProgressCalendar,
  type ProgressCalendarProps,
} from './calendar/ProgressCalendar';
export type ProgressViewProps = ProgressCalendarProps & {
  sheetAccessory?: ReactNode;
  day?: ProgressDay | undefined;
  dayLoading?: boolean;
  dayError?: boolean;
  loadMoreError?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  fetchingDay?: boolean;
  insetTop?: boolean;
  onCloseDay: () => void;
  onRetryDay?: (() => void) | undefined;
  onLoadMore?: (() => void) | undefined;
};

export function ProgressView({
  sheetAccessory,
  month,
  data,
  loading = false,
  updatingMonth = false,
  error = false,
  selectedDate,
  day,
  dayLoading = false,
  dayError = false,
  loadMoreError = false,
  hasMore = false,
  loadingMore = false,
  fetchingDay = false,
  insetTop = true,
  onMonth,
  onOpenDay,
  onCloseDay,
  onRetryMonth,
  onRetryDay,
  onLoadMore,
}: ProgressViewProps) {
  return (
    <SafeAreaView
      edges={insetTop ? ['top', 'left', 'right'] : ['left', 'right']}
      style={styles.safe}
    >
      <ProgressCalendar
        month={month}
        data={data}
        loading={loading}
        updatingMonth={updatingMonth}
        error={error}
        selectedDate={selectedDate}
        onMonth={onMonth}
        onOpenDay={onOpenDay}
        onRetryMonth={onRetryMonth}
      />
      <DaySheet
        key={selectedDate ?? 'closed'}
        topAccessory={sheetAccessory}
        date={selectedDate}
        day={day}
        loading={dayLoading}
        error={dayError}
        loadMoreError={loadMoreError}
        hasMore={hasMore}
        loadingMore={loadingMore}
        fetching={fetchingDay}
        onClose={onCloseDay}
        onRetry={onRetryDay}
        onLoadMore={onLoadMore}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
});
