import { Redirect, useLocalSearchParams } from 'expo-router';
export default function PreviewRoute() {
  const { simulateSkipFailure, progressState, progressDayState } =
    useLocalSearchParams<{
      simulateSkipFailure?: string;
      progressState?: string;
      progressDayState?: string;
    }>();
  if (!__DEV__) return <Redirect href="/" />;
  const { ScreenPreview } =
    require('../dev/previews/ScreenPreview') as typeof import('../dev/previews/ScreenPreview');
  return (
    <ScreenPreview
      simulateSkipFailure={simulateSkipFailure === '1'}
      progressState={
        progressState === 'empty' ||
        progressState === 'error' ||
        progressState === 'loading'
          ? progressState
          : 'default'
      }
      progressDayState={
        progressDayState === 'initial-error' ||
        progressDayState === 'load-more-error' ||
        progressDayState === 'loading-more'
          ? progressDayState
          : 'default'
      }
    />
  );
}
