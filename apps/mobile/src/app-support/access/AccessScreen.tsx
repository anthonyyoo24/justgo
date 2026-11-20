import { Redirect } from 'expo-router';
import { useIdentity } from '../providers/AppProvider';
import { useWelcomeTransition } from '../identity/welcome/WelcomeTransition';
import { AppLoadingScreen } from '../loading/AppLoadingScreen';
import { useAppLock } from './useAppLock';

/**
 * The startup route. It sends each identity state to its screen. With billing
 * off every owner enters the app, even offline. With billing on an owner with
 * no saved answer waits for the first check, and only verified access enters;
 * everyone else sees the locked screen.
 */
export function AccessScreen() {
  const identity = useIdentity();
  const awaitingWelcomeAccess = useWelcomeTransition();
  const lock = useAppLock();
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
  if (lock === 'checking') return <AppLoadingScreen />;
  if (lock === 'locked') return <Redirect href="/locked" />;
  return <Redirect href="/(tabs)" />;
}
