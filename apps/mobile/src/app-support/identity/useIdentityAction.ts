import { useCallback, useEffect, useRef, useState } from 'react';
import type { IdentityController } from './controller';

/** Presentation ownership only; the controller still owns failures and serialization. */
export function useIdentityAction(controller: IdentityController) {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [controller],
  );
  const runAction = useCallback(
    async (name: string, work: () => Promise<void>) => {
      if (controller.getSnapshot().busy) return;
      const current = ++generation.current;
      setActiveAction(name);
      try {
        await work();
      } finally {
        if (current === generation.current) setActiveAction(null);
      }
    },
    [controller],
  );
  return { activeAction, runAction };
}
