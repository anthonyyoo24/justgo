import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRuntime } from '../../providers/AppProvider';

type Job = {
  visit: object;
  ownerId: string;
  sessionId: string;
  submitted: boolean;
  inFlight: boolean;
};
type Presentation = { visit: object; busy: boolean; error: string | null };
const failureMessage = 'Couldn’t log out. Please try again.';

/** Present controller-owned logout without closing when its local session is fenced. */
export function useLogoutDialog() {
  const { identity } = useRuntime();
  const current = useRef<Job | null>(null);
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const close = useCallback(() => {
    current.current = null;
    setPresentation(null);
  }, []);
  const belongsToJob = useCallback(
    (job: Job) => {
      const latest = identity.getSnapshot();
      return (
        'collectionId' in latest &&
        latest.collectionId === job.ownerId &&
        !latest.deletionStatus &&
        (!latest.account ||
          (latest.account.userId === job.ownerId &&
            latest.account.sessionId === job.sessionId))
      );
    },
    [identity],
  );
  useFocusEffect(
    useCallback(() => {
      const unsubscribe = identity.subscribe(() => {
        const job = current.current;
        if (!job) return;
        const latest = identity.getSnapshot();
        if (!belongsToJob(job) || (!latest.account && !job.submitted)) close();
      });
      return () => {
        unsubscribe();
        close();
      };
    }, [identity, belongsToJob, close]),
  );
  const open = () => {
    const latest = identity.getSnapshot();
    if (latest.busy || !latest.account || latest.deletionStatus) return;
    const job: Job = {
      visit: {},
      ownerId: latest.account.userId,
      sessionId: latest.account.sessionId,
      submitted: false,
      inFlight: false,
    };
    current.current = job;
    setPresentation({ visit: job.visit, busy: false, error: null });
  };
  const confirm = async () => {
    const job = current.current;
    if (!job || job.visit !== presentation?.visit || job.inFlight) return;
    const latest = identity.getSnapshot();
    if (latest.busy) return;
    if (!belongsToJob(job) || (!job.submitted && !latest.account)) {
      close();
      return;
    }
    job.submitted = true;
    job.inFlight = true;
    setPresentation({ visit: job.visit, busy: true, error: null });
    let error = failureMessage;
    try {
      if (!('signOut' in identity)) return;
      // The controller persists logout and fences requests before remote revocation.
      // Repeating signOut resumes that operation, including after account becomes null.
      const finished = await identity.signOut();
      if (current.current !== job) return;
      const result = identity.getSnapshot();
      if (!belongsToJob(job) || finished) {
        close();
        return;
      }
      error = result.message || failureMessage;
    } catch {
      // Keep unexpected failures retryable without exposing exception details.
    } finally {
      job.inFlight = false;
      if (current.current === job)
        setPresentation({ visit: job.visit, busy: false, error });
    }
  };
  return {
    open,
    dialog: presentation
      ? {
          busy: presentation.busy,
          error: presentation.error,
          disabled: false,
          onCancel: () => {
            if (
              current.current?.visit === presentation.visit &&
              !current.current.inFlight
            )
              close();
          },
          onConfirm: () => {
            // Logout failures are handled above and remain inside this presentation.
            void confirm();
          },
        }
      : null,
  };
}
