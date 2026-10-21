import { useEffect, useState } from 'react';
import {
  useAccess,
  useIdentity,
  useJournal,
  useRuntime,
} from '../../providers/AppProvider';

/** Keep the provider page in place until the verified owner's deck is available. */
export function useSignInHandoff(focused: boolean, returnToData: boolean) {
  const identity = useIdentity();
  const access = useAccess();
  const repository = useJournal();
  const { challenges } = useRuntime();
  const [attempt, setAttempt] = useState(0);
  const [prepared, setPrepared] = useState<{
    key: string;
    attempt: number;
    ready: boolean;
  } | null>(null);
  const account = identity.account;
  const key = account ? `${account.userId}:${account.sessionId}` : null;
  const connected =
    focused && !!account && !identity.busy && !identity.deletionStatus;
  const canPrepare =
    connected &&
    !returnToData &&
    access.verified &&
    repository?.accountId === account?.userId;

  useEffect(() => {
    if (!canPrepare || !key || !repository) return;
    let current = true;
    const finish = (ready: boolean) => {
      if (current) setPrepared({ key, attempt, ready });
    };
    // refresh owns transport errors and may retain a usable cached catalog.
    // Its resolved promise alone is not evidence that an owned deck is ready.
    void challenges.refresh().then(
      () => {
        const journal = repository.store.getState();
        const deck = challenges.getSnapshot();
        finish(
          journal.ready &&
            !journal.hydrationError &&
            !!deck.queues[deck.selected]?.cards.length,
        );
      },
      () => finish(false),
    );
    return () => {
      current = false;
    };
  }, [canPrepare, key, repository, challenges, attempt]);

  const result =
    prepared?.key === key && prepared.attempt === attempt ? prepared : null;
  const destination: '/data' | '/(tabs)' | '/access' | null = !connected
    ? null
    : returnToData
      ? '/data'
      : access.verified
        ? result?.ready
          ? '/(tabs)'
          : null
        : !access.isPending && !access.isFetching
          ? '/access'
          : null;
  return {
    destination,
    error:
      canPrepare && result?.ready === false
        ? 'Your challenges couldn’t load. Check your connection and try again.'
        : '',
    retry: () => setAttempt((value) => value + 1),
  };
}
