import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { AppState } from 'react-native';
import { useIdentity, useRuntime } from '../../providers/AppProvider';

type Visit = { userId: string | null };
type Job = {
  visit: Visit;
  submitted: boolean;
  inFlight: boolean;
  revision: number;
};
type Presentation = {
  visit: Visit;
  submitted: boolean;
  working: boolean;
  error: string | null;
  revision: number;
};
const failureMessage =
  'Couldn’t finish deleting your account. Please try again.';
const isUnfinished = (
  status: ReturnType<typeof useIdentity>['deletionStatus'],
) => status === 'pending' || status === 'cleanup';

export function useAccountDeletionDialog() {
  const { identity } = useRuntime();
  const state = useIdentity();
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const current = useRef<Job | null>(null);
  const dismissed = useRef(false);
  const pending = isUnfinished(state.deletionStatus);
  const close = useCallback(() => {
    current.current = null;
    setPresentation(null);
  }, []);
  const open = useCallback(() => {
    const latest = identity.getSnapshot();
    const resuming = isUnfinished(latest.deletionStatus);
    if (
      current.current?.inFlight ||
      (latest.busy && !resuming) ||
      latest.deletionStatus === 'deleted' ||
      (!latest.account && !resuming)
    )
      return;
    const visit = { userId: latest.account?.userId ?? null };
    current.current = {
      visit,
      submitted: resuming,
      inFlight: false,
      revision: 0,
    };
    dismissed.current = false;
    setPresentation({
      visit,
      submitted: resuming,
      working: false,
      error: null,
      revision: 0,
    });
  }, [identity]);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      dismissed.current = false;
      const reconcile = () => {
        if (!active) return;
        const latest = identity.getSnapshot();
        const job = current.current;
        if (
          latest.deletionStatus === 'deleted' ||
          (job &&
            latest.account &&
            latest.account.userId !== job.visit.userId) ||
          (job && !job.submitted && !latest.account)
        )
          close();
        else if (
          isUnfinished(latest.deletionStatus) &&
          !job &&
          !dismissed.current
        )
          open();
      };
      const unsubscribe = identity.subscribe(reconcile);
      // Reconcile after subscribing so slow hydration and the connection gap are covered.
      reconcile();
      return () => {
        active = false;
        unsubscribe();
        close();
      };
    }, [identity, open, close]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active' && !current.current?.submitted) close();
    });
    return () => subscription.remove();
  }, [close]);

  const busy =
    !!presentation &&
    (presentation.working || (presentation.submitted && state.busy));
  const cancel = () => {
    const job = current.current;
    if (
      !job ||
      job.visit !== presentation?.visit ||
      job.revision !== presentation.revision ||
      job.inFlight ||
      busy
    )
      return;
    dismissed.current = true;
    close();
  };
  const confirm = () => {
    const job = current.current;
    if (
      !job ||
      job.visit !== presentation?.visit ||
      job.revision !== presentation.revision ||
      job.inFlight
    )
      return;
    const latest = identity.getSnapshot();
    const resuming = isUnfinished(latest.deletionStatus);
    if (latest.busy) return;
    if (
      latest.deletionStatus === 'deleted' ||
      (latest.account && latest.account.userId !== job.visit.userId) ||
      (!resuming && latest.account?.userId !== job.visit.userId) ||
      (!job.submitted && resuming)
    ) {
      close();
      return;
    }
    job.submitted = true;
    job.inFlight = true;
    job.revision++;
    setPresentation({
      visit: job.visit,
      submitted: true,
      working: true,
      error: null,
      revision: job.revision,
    });
    // The controller retains the deletion proof and owns transport/cleanup errors.
    // This job only presents them, fencing callbacks across visits and attempts.
    const run = async () => {
      let message = failureMessage;
      try {
        if (resuming) await identity.retry();
        else await identity.deleteAccount();
        if (current.current !== job) return;
        const result = identity.getSnapshot();
        if (
          result.deletionStatus === 'deleted' ||
          (result.account && result.account.userId !== job.visit.userId)
        ) {
          close();
          return;
        }
        message = result.message || failureMessage;
      } catch {
        // Unexpected rejections get safe feedback; controller failures publish their own message.
      } finally {
        job.inFlight = false;
        if (current.current === job) {
          job.revision++;
          setPresentation({
            visit: job.visit,
            submitted: true,
            working: false,
            error: message,
            revision: job.revision,
          });
        }
      }
    };
    void run();
  };
  return {
    state,
    pending,
    open,
    dialog: presentation
      ? {
          busy,
          error: busy
            ? null
            : (presentation.error ??
              (presentation.submitted ? state.message || null : null)),
          cleanup: state.deletionStatus === 'cleanup',
          disabled: state.busy || (!state.account && !pending),
          onCancel: cancel,
          onConfirm: confirm,
        }
      : null,
  };
}
