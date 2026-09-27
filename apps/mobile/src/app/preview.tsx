import { Redirect, useLocalSearchParams } from 'expo-router';
export default function PreviewRoute() {
  const { simulateSkipFailure } = useLocalSearchParams<{
    simulateSkipFailure?: string;
  }>();
  if (!__DEV__) return <Redirect href="/" />;
  const { ScreenPreview } =
    require('../features/shell/ScreenPreview') as typeof import('../features/shell/ScreenPreview');
  return <ScreenPreview simulateSkipFailure={simulateSkipFailure === '1'} />;
}
