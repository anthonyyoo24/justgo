import { useEffect, useState } from 'react';

export const localSaveFeedbackDelay = 200;
// The caller supplies local submission state, never background upload state.
export function useDelayedBusy(busy: boolean) {
  const [feedback, setFeedback] = useState({ busy, visible: false });
  // Reset each new operation during render so it cannot reuse a previous delay.
  if (feedback.busy !== busy) setFeedback({ busy, visible: false });
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(
      () => setFeedback({ busy: true, visible: true }),
      localSaveFeedbackDelay,
    );
    return () => clearTimeout(timer);
  }, [busy]);
  return busy && feedback.busy && feedback.visible;
}
