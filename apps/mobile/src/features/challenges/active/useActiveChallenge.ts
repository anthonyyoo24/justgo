import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChallengeController, ChallengeStart } from '../controller';
import { useHapticFeedback } from '../../../platform/haptics/haptics';

const currentTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
const locked = async () => false;

/** React-owned unfinished activity, with synchronous guards before React commits. */
export function useActiveChallenge(
  controller: ChallengeController,
  {
    canStart,
    unlock = locked,
    now = Date.now,
    timeZone = currentTimeZone,
  }: {
    canStart: () => boolean;
    /** Asks the person to unlock a refused start. Resolves true once access is verified. */
    unlock?: () => Promise<boolean>;
    now?: () => number;
    timeZone?: () => string;
  },
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
      const front = () => {
        const state = controller.getSnapshot();
        const card = state.queues[state.selected]?.cards[0];
        return alive.current &&
          !current.current &&
          !state.saving &&
          !state.success &&
          card
          ? { state, card }
          : null;
      };
      const before = front();
      if (!before) return;
      const { state } = before;
      if (direction === -1) controller.skip();
      else {
        // The deck has already let the card go, so it starts only if it is
        // still the front card once access is unlocked.
        if (!canStart()) {
          if (!(await unlock())) return;
          const after = front();
          if (
            !after ||
            after.state.selected !== state.selected ||
            after.card.id !== before.card.id ||
            !canStart()
          )
            return;
        }
        const queue = controller.getSnapshot().queues[state.selected]!;
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
    [controller, canStart, unlock, now, timeZone, feedback],
  );
  const finish = useCallback(
    async (outcome: 'completed' | 'given_up') => {
      const start = current.current;
      if (!alive.current || !start) return;
      if (outcome === 'given_up') {
        if (controller.getSnapshot().completionStarted) return;
        controller.skip(start.card.venue, start.card.id);
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
