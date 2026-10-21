import {
  createContext,
  useCallback,
  useContext,
  useState,
  type PropsWithChildren,
} from 'react';
import type { ChallengeStart } from '../controller';
import {
  useSafeAreaInsets,
  type EdgeInsets,
} from 'react-native-safe-area-context';
import {
  useIdentity,
  useRuntime,
} from '../../../app-support/providers/AppProvider';
import { useActiveChallenge } from './useActiveChallenge';

type Activity = ReturnType<typeof useActiveChallenge> & {
  insets: EdgeInsets;
  presentedStart: ChallengeStart | null;
  markPresented: (start: ChallengeStart) => void;
};
const Context = createContext<Activity | null>(null);

/** Share unfinished activity across Home and its native route, only in memory. */
export function ChallengeActivityProvider({ children }: PropsWithChildren) {
  const identity = useIdentity();
  const owner =
    identity.account?.userId ??
    ('collectionId' in identity && typeof identity.collectionId === 'string'
      ? identity.collectionId
      : null);
  return (
    <AccountActivity key={owner ?? 'disconnected'}>{children}</AccountActivity>
  );
}

function AccountActivity({ children }: PropsWithChildren) {
  const { challenges } = useRuntime();
  const activity = useActiveChallenge(challenges);
  const [presentedStart, setPresentedStart] = useState<ChallengeStart | null>(
    null,
  );
  const markPresented = useCallback(
    (start: ChallengeStart) => setPresentedStart(start),
    [],
  );
  // Measure above the native stack so newly presented screens start with the
  // existing window insets instead of waiting for another native measurement.
  const insets = useSafeAreaInsets();
  return (
    <Context.Provider
      value={{ ...activity, insets, presentedStart, markPresented }}
    >
      {children}
    </Context.Provider>
  );
}

export function useChallengeActivity() {
  const activity = useContext(Context);
  if (!activity) throw new Error('ChallengeActivityProvider is required');
  return activity;
}
