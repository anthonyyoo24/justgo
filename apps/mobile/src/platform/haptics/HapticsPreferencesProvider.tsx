import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { hapticAdapter } from './haptic-feedback';
import { useCompletionHaptics } from './completion/useCompletionHaptics';
import { CompletionHapticsContext } from './completion/completion-haptics';
import {
  HapticsContext,
  type HapticAdapter,
  type HapticFeedback,
} from './haptics';

export const hapticsPreferenceKey = 'justgo:haptics:v1';
export type HapticsStorage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

export function HapticsPreferencesProvider({
  children,
  storage = AsyncStorage,
  adapter = hapticAdapter,
}: PropsWithChildren<{
  storage?: HapticsStorage;
  adapter?: HapticAdapter;
}>) {
  const [dependencies] = useState(() => ({
    storage,
    adapter,
  }));
  const [available] = useState(() => dependencies.adapter.isAvailable());
  const [enabled, setChoice] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runtime = useRef({
    alive: false,
    loading: true,
    saving: false,
    enabled: false,
    generation: 0,
  });
  const allowed = useCallback(() => {
    const state = runtime.current;
    const generation = state.generation;
    return () =>
      state.alive &&
      !state.loading &&
      !state.saving &&
      state.enabled &&
      generation === state.generation;
  }, []);
  const {
    testing,
    play: playCompletion,
    stop,
  } = useCompletionHaptics(dependencies.adapter, allowed);

  useEffect(() => {
    const state = runtime.current;
    state.alive = true;
    state.loading = true;
    const generation = ++state.generation;
    // No feedback during hydration; a saved off choice must apply first.
    void dependencies.storage
      .getItem(hapticsPreferenceKey)
      .then((value) => {
        if (!state.alive || generation !== state.generation) return;
        state.enabled = value === null || value === 'true';
        setChoice(state.enabled);
        if (value !== null && value !== 'true' && value !== 'false')
          setError(
            'Haptics are off. Turn them on to save your preference again.',
          );
      })
      .catch(() => {
        if (!state.alive || generation !== state.generation) return;
        state.enabled = false;
        setChoice(false);
        setError('Your haptics preference couldn’t load. Try saving it again.');
      })
      .finally(() => {
        if (state.alive && generation === state.generation) {
          state.loading = false;
          setLoading(false);
        }
      });
    return () => {
      state.alive = false;
      state.generation++;
    };
  }, [dependencies]);

  const feedback = useCallback(
    (kind: HapticFeedback) => {
      const stillAllowed = allowed();
      if (!available || !stillAllowed()) return;
      // Optional tactile feedback never delays or fails a product action. The
      // preference is checked again immediately before native I/O to fence old events.
      void Promise.resolve()
        .then(() => {
          if (stillAllowed())
            return kind === 'completed'
              ? playCompletion(stillAllowed)
              : dependencies.adapter.play(kind, stillAllowed);
        })
        .catch(() => {});
    },
    [available, dependencies, allowed, playCompletion],
  );

  const setEnabled = useCallback(
    async (next: boolean) => {
      const state = runtime.current;
      if (
        !state.alive ||
        state.loading ||
        state.saving ||
        next === state.enabled
      )
        return;
      state.saving = true;
      stop();
      const generation = ++state.generation;
      setSaving(true);
      setError(null);
      try {
        await dependencies.storage.setItem(hapticsPreferenceKey, String(next));
        if (state.alive && generation === state.generation) {
          state.enabled = next;
          setChoice(next);
        }
      } catch {
        if (state.alive && generation === state.generation)
          setError('Your haptics preference couldn’t save. Please try again.');
      } finally {
        state.saving = false;
        if (state.alive) setSaving(false);
      }
      if (next && state.enabled && generation === state.generation)
        feedback('selection');
    },
    [dependencies, feedback, stop],
  );

  const value = useMemo(
    () => ({
      enabled,
      available,
      loading,
      saving,
      error,
      setEnabled,
      feedback,
    }),
    [enabled, available, loading, saving, error, setEnabled, feedback],
  );
  return (
    <HapticsContext.Provider value={value}>
      <CompletionHapticsContext.Provider value={testing}>
        {children}
      </CompletionHapticsContext.Provider>
    </HapticsContext.Provider>
  );
}
