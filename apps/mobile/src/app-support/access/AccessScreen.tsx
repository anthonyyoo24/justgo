import { Redirect } from 'expo-router';
import { useIdentity } from '../providers/AppProvider';
import { useWelcomeTransition } from '../identity/welcome/WelcomeTransition';
import { AppLoadingScreen } from '../loading/AppLoadingScreen';

/**
 * The startup route. It sends each identity state to its screen and never
 * waits on the server: while JustGO is free, every owner enters the app, even
 * offline. `admission.ts` owns whether a challenge may start.
 */
export function AccessScreen() {
  const identity = useIdentity();
  const awaitingWelcomeAccess = useWelcomeTransition();
  const localCollection = 'collectionId' in identity && !!identity.collectionId;
  if (identity.deletionStatus === 'deleted' || identity.needsWelcome)
    return <Redirect href="/welcome" />;
  if (
    identity.deletionStatus === 'pending' ||
    identity.deletionStatus === 'cleanup'
  )
    return <Redirect href="/delete-account" />;
  if (
    !identity.initialized ||
    (identity.busy && !identity.account && !localCollection)
  )
    return <AppLoadingScreen />;
  if (!identity.account && !localCollection)
    return <Redirect href="/recovery" />;
  if (awaitingWelcomeAccess) return <Redirect href="/acceptance" />;
  return <Redirect href="/(tabs)" />;
}
