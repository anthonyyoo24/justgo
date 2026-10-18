import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { View } from 'react-native';
import {
  useAccess,
  useIdentity,
  useRuntime,
  useAcceptance,
} from '../../providers/AppProvider';
import { WelcomePreparationContext } from './welcome-preparation';
import { AcceptancePreparationCover } from '../../acceptance/AcceptancePreparationCover';

const Context = createContext(false);
export const useWelcomeTransition = () => useContext(Context);
const EntryContext = createContext<() => void>(() => {});
export const useBeginWelcomeEntry = () => useContext(EntryContext);
const CancelEntryContext = createContext<() => void>(() => {});
export const useCancelWelcomeEntry = () => useContext(CancelEntryContext);

type Handoff = {
  phase: 'normal' | 'welcome' | 'checking' | 'preparing';
  owner: string | null;
  attempt: number;
  shown: boolean;
  ready: boolean;
};

/** Keep Terms & Privacy above account navigation until its first deck paints. */
export function WelcomeTransition({ children }: PropsWithChildren) {
  const identity = useIdentity();
  const access = useAccess();
  const acceptance = useAcceptance();
  const { challenges } = useRuntime();
  const deleted = identity.deletionStatus === 'deleted';
  const [entryRequested, setEntryRequested] = useState(false);
  const needsWelcome = deleted || (identity.needsWelcome && entryRequested);
  const owner = identity.account?.userId ?? null;
  const [handoff, setHandoff] = useState<Handoff>({
    phase: needsWelcome ? 'welcome' : 'normal',
    owner: null,
    attempt: 0,
    shown: false,
    ready: false,
  });
  let next = handoff;
  if (needsWelcome && handoff.phase !== 'welcome') {
    next = {
      phase: 'welcome',
      owner: null,
      attempt: 0,
      shown: false,
      ready: false,
    };
  } else if (!needsWelcome && handoff.phase !== 'normal') {
    if (!owner || (handoff.owner && handoff.owner !== owner)) {
      next = { ...handoff, phase: 'normal', ready: false };
    } else if (acceptance.status !== 'accepted') {
      // Keep acceptance retries visible; preparing the deck must never cover them.
      if (
        handoff.phase !== 'welcome' ||
        handoff.owner !== owner ||
        handoff.ready
      )
        next = { ...handoff, phase: 'welcome', owner, ready: false };
    } else if (handoff.phase === 'welcome' || handoff.phase === 'checking') {
      const phase = access.isPending
        ? 'checking'
        : access.verified
          ? 'preparing'
          : 'normal';
      if (handoff.phase !== phase || handoff.owner !== owner)
        next = { ...handoff, phase, owner };
    } else if (!access.verified) {
      next = { ...handoff, phase: 'normal', ready: false };
    }
  }
  // Reconcile the handoff before rendering routes, so no intermediate page paints.
  if (handoff !== next) setHandoff(next);
  const covered = next.phase === 'checking' || next.phase === 'preparing';
  const preparing = next.phase === 'preparing' && next.shown;
  const attempt = next.attempt;

  const markReady = useMemo(
    () => () => {
      setHandoff((current) =>
        current.owner === owner &&
        current.attempt === attempt &&
        current.phase === 'preparing' &&
        current.shown &&
        !current.ready
          ? { ...current, ready: true }
          : current,
      );
    },
    [owner, attempt],
  );
  const preparation = useMemo(
    () => ({ active: preparing, attempt, markReady }),
    [preparing, attempt, markReady],
  );
  useEffect(() => {
    if (next.phase !== 'preparing' || !next.ready) return;
    let secondFrame: number | undefined;
    // Layout/image events precede paint. Keep the cover through that paint,
    // then reveal the already mounted deck without changing its identity.
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        setHandoff((current) =>
          current.owner === owner &&
          current.attempt === attempt &&
          current.ready
            ? { ...current, phase: 'normal' }
            : current,
        );
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [next.phase, next.ready, owner, attempt]);

  return (
    <CancelEntryContext.Provider
      value={() => {
        setEntryRequested(false);
        setHandoff((current) => ({
          ...current,
          phase: 'normal',
          ready: false,
        }));
      }}
    >
      <EntryContext.Provider value={() => setEntryRequested(true)}>
        <Context.Provider
          value={
            next.phase === 'checking' ||
            (next.phase === 'preparing' && !next.shown)
          }
        >
          <WelcomePreparationContext.Provider value={preparation}>
            <View style={{ flex: 1 }}>
              <View
                style={{ flex: 1 }}
                aria-hidden={covered}
                accessibilityElementsHidden={covered}
                importantForAccessibility={
                  covered ? 'no-hide-descendants' : 'auto'
                }
              >
                {children}
              </View>
              {covered && (
                <AcceptancePreparationCover
                  key={owner}
                  preparing={preparing}
                  attempt={attempt}
                  onShow={() =>
                    setHandoff((current) =>
                      current.owner === owner && !current.shown
                        ? { ...current, shown: true }
                        : current,
                    )
                  }
                  onRetry={() => {
                    setHandoff((current) =>
                      current.owner === owner && current.phase === 'preparing'
                        ? {
                            ...current,
                            attempt: current.attempt + 1,
                            ready: false,
                          }
                        : current,
                    );
                    // The controller owns network failures; retry the same account.
                    void challenges.refresh();
                  }}
                />
              )}
            </View>
          </WelcomePreparationContext.Provider>
        </Context.Provider>
      </EntryContext.Provider>
    </CancelEntryContext.Provider>
  );
}
