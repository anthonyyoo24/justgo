import { useEffect, useRef, useState } from 'react';
import type { IdentityController } from '../controller';
import type { IdentityActionId } from './identity-actions';

type Confirmation = {
  message: string;
  id: IdentityActionId;
  action: () => Promise<void>;
  recoveryVisible: boolean;
};

/** Preserve the receiving form while confirmation runs, fencing late settlements. */
export function useIdentityConfirmation(
  controller: IdentityController,
  runAction: (
    id: IdentityActionId,
    action: () => Promise<void>,
  ) => Promise<void>,
) {
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [controller],
  );
  const confirm = (
    message: string,
    id: IdentityActionId,
    action: () => Promise<void>,
    recoveryVisible: boolean,
  ) => setConfirmation({ message, id, action, recoveryVisible });
  const cancelConfirmation = () => {
    generation.current++;
    setConfirmation(null);
  };
  const runConfirmation = async () => {
    const selected = confirmation;
    if (!selected || controller.getSnapshot().busy) return;
    const current = ++generation.current;
    await runAction(selected.id, selected.action);
    if (current === generation.current)
      setConfirmation((value) => (value === selected ? null : value));
  };
  return { confirmation, confirm, cancelConfirmation, runConfirmation };
}
