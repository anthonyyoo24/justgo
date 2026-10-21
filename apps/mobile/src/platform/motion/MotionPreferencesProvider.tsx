import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AccessibilityInfo, AppState } from 'react-native';
import { MotionContext, motionPreferenceKey } from './motion';

export { motionPreferenceKey } from './motion';
export type MotionStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

// This accessibility preference belongs to the installation, independently of
// accounts, paid access and journal storage. Only a boolean is persisted.
export function MotionPreferencesProvider({
  children,
  storage = AsyncStorage,
}: PropsWithChildren<{ storage?: MotionStorage }>) {
  // The adapter is fixed for this provider's lifetime, like its installation.
  const [adapter] = useState(() => storage);
  const [requested, setRequested] = useState(false);
  const [systemReduced, setSystemReduced] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(false);
  const busy = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    alive.current = true;
    generation.current++;
    busy.current = false;
    let cancelled = false;
    let systemRevision = 0;
    const refreshSystem = () => {
      const revision = ++systemRevision;
      // Errors keep motion reduced until a later foreground read/event succeeds.
      void AccessibilityInfo.isReduceMotionEnabled()
        .then((enabled) => {
          if (!cancelled && revision === systemRevision)
            setSystemReduced(enabled);
        })
        .catch(() => {
          if (!cancelled && revision === systemRevision) setSystemReduced(null);
        });
    };
    const motionListener = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (enabled) => {
        systemRevision++;
        if (!cancelled) setSystemReduced(enabled);
      },
    );
    const foregroundListener = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshSystem();
    });
    refreshSystem();
    // Input stays disabled through hydration, so a late read cannot replace a
    // newer choice. Invalid stored values never become truthy preferences.
    void adapter
      .getItem(motionPreferenceKey)
      .then((value) => {
        if (!cancelled) setRequested(value === 'true');
      })
      .catch(() => {
        if (!cancelled)
          setError(
            'Your motion preference couldn’t load. Try saving it again.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      alive.current = false;
      motionListener.remove();
      foregroundListener.remove();
    };
  }, [adapter]);

  const setReduced = useCallback(
    async (enabled: boolean) => {
      if (!alive.current || loading || busy.current) return;
      busy.current = true;
      const currentGeneration = generation.current;
      setSaving(true);
      setError(null);
      try {
        await adapter.setItem(motionPreferenceKey, String(enabled));
        if (alive.current && generation.current === currentGeneration)
          setRequested(enabled);
      } catch {
        if (alive.current && generation.current === currentGeneration)
          setError('Your motion preference couldn’t save. Please try again.');
      } finally {
        if (generation.current === currentGeneration) {
          busy.current = false;
          if (alive.current) setSaving(false);
        }
      }
    },
    [loading, adapter],
  );
  const value = useMemo(
    () => ({
      // A phone-level preference always wins. Avoid initial moving frames while
      // either accessibility settings or the saved preference are still loading.
      reduceMotion: loading || systemReduced !== false || requested,
      requestedReduceMotion: requested,
      systemReduced,
      loading,
      saving,
      error,
      setReduced,
    }),
    [requested, systemReduced, loading, saving, error, setReduced],
  );
  return (
    <MotionContext.Provider value={value}>{children}</MotionContext.Provider>
  );
}
