import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  accessResponseSchema,
  hasVerifiedAccess,
  type AccessResponse,
} from '@justgo/contracts';
import {
  accountKey,
  type AccountClient,
} from '../../../lib/network/account-client';
import { ApiError } from '../../../lib/network/http';
import { readAccess } from '../api';
import {
  approvalExpiresAt,
  hasBetaApproval,
  serverClockOffset,
} from './policy';
import { AccessStore } from './store';

/** Read the current owner/query/clock at the actual start action, not its render. */
export function canStartChallenge(
  client: AccountClient,
  store: AccessStore,
  now = Date.now(),
) {
  const state = store.getSnapshot();
  if (!state.owner) return false;
  if (hasBetaApproval(state.approval, now)) return true;
  const query = client.queries.getQueryState<AccessResponse>(
    accountKey(state.owner.id, 'access', state.owner.kind),
  );
  // Beta responses are admitted only through the scoped, validated store. A
  // denial can clear that store before an older Query result is replaced.
  return (
    query?.data?.source !== 'free_beta' &&
    query?.status !== 'error' &&
    hasVerifiedAccess(
      query?.data,
      Math.max(now, query?.dataUpdatedAt ?? 0) +
        serverClockOffset(query?.data, query?.dataUpdatedAt ?? 0),
    )
  );
}

export function useAccessState(client: AccountClient, store: AccessStore) {
  const state = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const owner = state.owner;
  const enabled =
    !!owner &&
    (owner.kind === 'guest' || state.authenticated) &&
    state.online &&
    state.active;
  const query = useQuery({
    queryKey: accountKey(
      owner?.id ?? 'disconnected',
      'access',
      owner?.kind ?? 'guest',
    ),
    enabled,
    queryFn: async ({ signal }) => {
      if (!owner) throw new ApiError('ACCOUNT_CHANGED');
      const lease = store.beginRequest(owner);
      if (!lease) throw new ApiError('ACCOUNT_CHANGED');
      const result =
        owner.kind === 'account'
          ? await readAccess(client, signal)
          : await client.requestGuest(
              '/v1/guest/access',
              accessResponseSchema,
              signal,
            );
      if (!signal.aborted) {
        // Store owns serialized persistence failures and their safe status.
        // Optional disk I/O must not hold Query's later online rechecks open.
        void store.receive(lease, result, Date.now());
      }
      return result;
    },
    refetchInterval: 30_000,
  });
  const [tick, setTick] = useState(0);
  const verified = canStartChallenge(client, store);
  const data = query.data ?? state.approval?.access;
  const closesAt = state.approval
    ? approvalExpiresAt(state.approval)
    : query.data?.status === 'verified' && query.data.source !== 'free_beta'
      ? Math.min(
          Date.parse(query.data.expiresAt),
          Date.parse(query.data.checkedAt) + 60_000,
        ) - serverClockOffset(query.data, query.dataUpdatedAt)
      : null;
  useEffect(() => {
    if (closesAt === null) return;
    const remaining = closesAt - Date.now();
    if (remaining <= 0) return;
    // JS timers cannot represent arbitrarily distant beta expiry. Re-evaluate
    // after each bounded timer, including after foregrounding a suspended app.
    const timer = setTimeout(
      () => {
        setTick((value) => value + 1);
      },
      Math.min(remaining, 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [closesAt, tick, state.online, state.active]);
  return {
    ...query,
    data,
    verified,
    isPending: verified
      ? false
      : state.hydrating || (enabled && query.isPending),
    storageUnavailable: state.storageUnavailable,
  };
}
