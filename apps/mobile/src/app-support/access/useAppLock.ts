import { useSyncExternalStore } from 'react';
import { useRuntime } from '../providers/AppProvider';

const alwaysOpen = () => 'open' as const;
const noSubscription = () => () => {};

/**
 * Whether the app opens for the owner on the phone. With billing off nothing
 * locks. With billing on only a verified saved answer opens the app.
 */
export function useAppLock(): 'open' | 'checking' | 'locked' {
  const { access } = useRuntime();
  return useSyncExternalStore(
    access?.subscribe ?? noSubscription,
    access ? () => access.status() : alwaysOpen,
    access ? () => access.status() : alwaysOpen,
  );
}
