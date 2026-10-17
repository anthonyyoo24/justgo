import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChallengeController, ChallengeStart } from '../controller';
import { useHapticFeedback } from '../../../platform/haptics/haptics';

const currentTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** React-owned unfinished activity, with synchronous guards before React commits. */
export function useActiveChallenge(
  controller: ChallengeController,
  { now = Date.now, timeZone = currentTimeZone } = {},
) {
  const feedback = useHapticFeedback();
  const [active, setActive] = useState<ChallengeStart | null>(null);
  const current = useRef<ChallengeStart | null>(null);
  const alive = useRef(true);
  const completedFeedback = useRef<ChallengeStart | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      current.current = null;
    };
  }, []);
  const clear = useCallback(() => {
    current.current = null;
    if (alive.current) setActive(null);
  }, []);
  const onAction = useCallback(
    async (direction: -1 | 1) => {
      const state = controller.getSnapshot();
      const queue = state.queues[state.selected];
      if (
        !alive.current ||
        current.current ||
        state.saving ||
        state.success ||
        !queue?.cards.length
      )
        return;
      if (direction === -1) controller.skip();
      else {
        const start = {
          card: { ...queue.cards[0]! },
          startedAt: new Date(now()).toISOString(),
          startTimeZone: timeZone(),
          turn: queue.turn,
        };
        current.current = start;
        setActive(start);
        feedback('accept');
      }
      return controller.getSnapshot().queues[state.selected]?.turn;
    },
    [controller, now, timeZone, feedback],
  );
  const finish = useCallback(
    async (outcome: 'completed' | 'given_up') => {
      const start = current.current;
      if (!alive.current || !start) return;
      if (outcome === 'given_up') {
        if (controller.getSnapshot().completionStarted) return;
        controller.skip(start.card.venue);
        clear();
      } else {
        // The controller/repository retain accepted submissions and own failures.
        await controller.complete(start);
        if (
          alive.current &&
          current.current === start &&
          controller.getSnapshot().success &&
          completedFeedback.current !== start
        ) {
          completedFeedback.current = start;
          feedback('completed');
        }
      }
    },
    [controller, clear, feedback],
  );
  return { active, onAction, finish, clear };
}
