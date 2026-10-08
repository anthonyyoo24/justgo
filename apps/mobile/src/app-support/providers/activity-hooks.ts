import { useSyncExternalStore } from 'react';
import type { ActivityRuntime } from './activity-runtime';

export function useActivityStore(activity: ActivityRuntime) {
  const repository = useSyncExternalStore(
    activity.store.subscribe,
    activity.getRepository,
    activity.getRepository,
  );
  const state = useSyncExternalStore(
    repository?.store.subscribe ?? (() => () => {}),
    repository?.store.getState ?? (() => null),
    repository?.store.getState ?? (() => null),
  );
  return { repository, state };
}
