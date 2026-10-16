import { Redirect, useLocalSearchParams } from 'expo-router';
export default function PreviewRoute() {
  const { mode, progressState, progressDayState, state } =
    useLocalSearchParams<{
      mode?: string;
      progressState?: string;
      progressDayState?: string;
      state?: string;
    }>();
  if (!__DEV__) return <Redirect href="/" />;
  if (mode === 'welcome') {
    const { WelcomePreview } =
      require('../dev/previews/WelcomePreview') as typeof import('../dev/previews/WelcomePreview');
    return <WelcomePreview state={state ?? 'default'} />;
  }
  if (mode === 'haptics') {
    const { HapticsTestScreen } =
      require('../dev/haptics/HapticsTestScreen') as typeof import('../dev/haptics/HapticsTestScreen');
    return <HapticsTestScreen />;
  }
  const { ScreenPreview } =
    require('../dev/previews/ScreenPreview') as typeof import('../dev/previews/ScreenPreview');
  return (
    <ScreenPreview
      progressState={
        progressState === 'empty' ||
        progressState === 'error' ||
        progressState === 'loading' ||
        progressState === 'syncing'
          ? progressState
          : 'default'
      }
      progressDayState={
        progressDayState === 'offline' ||
        progressDayState === 'initial-error' ||
        progressDayState === 'load-more-error' ||
        progressDayState === 'loading-more'
          ? progressDayState
          : 'default'
      }
    />
  );
}
