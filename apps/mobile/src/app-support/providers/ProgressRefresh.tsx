import { useEffect } from 'react';
import { accountKey, type AccountClient } from '../../lib/account-client';
import { useProgressReads } from '../../data/activity/useProgressReads';
import { reconcileDayQueries } from '../../data/activity/progress-read-cache';
import type { ActivityRuntime } from './activity-runtime';
import { useActivityStore } from './activity-hooks';

export function ProgressRefresh({
  client,
  activity,
}: {
  client: AccountClient;
  activity: ActivityRuntime;
}) {
  const { repository, state } = useActivityStore(activity);
  useProgressReads(client, repository, state);
  const sequence = state?.remoteRefreshSequence;
  const online = state?.online;
  useEffect(() => {
    if (!repository) return;
    const queryKey = accountKey(repository.accountId, 'progress');
    // TanStack owns request failures. Invalidation also refreshes mounted older
    // history; disabled offline/unknown-create reads retain their local baseline.
    if (online) {
      reconcileDayQueries(
        client.queries,
        repository.accountId,
        repository.store.getState(),
      );
      void client.queries.invalidateQueries({ queryKey });
    } else void client.queries.cancelQueries({ queryKey });
  }, [client, repository, sequence, online]);
  return null;
}
