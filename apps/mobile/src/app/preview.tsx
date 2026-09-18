import { Redirect } from 'expo-router';
export default function PreviewRoute() {
  if (!__DEV__) return <Redirect href="/" />;
  const { ScreenPreview } =
    require('../features/shell/ScreenPreview') as typeof import('../features/shell/ScreenPreview');
  return <ScreenPreview />;
}
