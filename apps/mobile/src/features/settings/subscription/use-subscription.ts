import { useSyncExternalStore } from 'react';
import type { PaidAccess } from '../../../app-support/access/paid-access';
import { summarizeSubscription } from './subscription-summary';

const noSubscription = () => () => {};
const none = () => null;

/** The saved subscription of the current owner, or null when billing is off. */
export function useSubscription(access: PaidAccess | null) {
  const answer = useSyncExternalStore(
    access?.subscribe ?? noSubscription,
    access ? () => access.answer() : none,
    access ? () => access.answer() : none,
  );
  return access ? summarizeSubscription(answer, access.hasAccess()) : null;
}
