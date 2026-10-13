import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { HapticAdapter } from '../haptics';
import { defaultCompletionHaptic } from './completion-haptics';
import type {
  CompletionHaptic,
  CompletionHapticAdapter,
  CompletionHapticsTesting,
} from './completion-haptics';

/** Development overrides are session-only; release uses the approved default. */
export function useCompletionHaptics(
  current: HapticAdapter,
  pulsar: CompletionHapticAdapter,
  allowed: () => () => boolean,
) {
  const [selected, setSelected] = useState<CompletionHaptic>(
    defaultCompletionHaptic,
  );
  const [pulsarAvailable] = useState(() => pulsar.isAvailable());
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runtime = useRef({
    selected,
    generation: 0,
    previewing: false,
    alive: true,
  });
  const stop = useCallback(() => {
    runtime.current.generation++;
    try {
      pulsar.stop();
    } catch {
      // Optional native feedback cannot prevent preference changes or cleanup.
    }
  }, [pulsar]);
  useEffect(() => {
    const state = runtime.current;
    state.alive = true;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') stop();
    });
    return () => {
      state.alive = false;
      subscription.remove();
      stop();
    };
  }, [stop]);

  const play = useCallback(
    async (stillAllowed: () => boolean, preview = false) => {
      if (!stillAllowed()) return;
      stop();
      const state = runtime.current;
      const generation = state.generation;
      const fenced = () =>
        state.alive && generation === state.generation && stillAllowed();
      const preset = __DEV__ ? state.selected : defaultCompletionHaptic;
      if (preset === 'current' || !pulsarAvailable) {
        if (preview && preset !== 'current')
          throw new Error('Pulsar module unavailable');
        await current.play('completed', fenced);
      } else if (fenced()) {
        pulsar.play(preset);
      }
    },
    [current, pulsar, pulsarAvailable, stop],
  );
  const select = useCallback(
    (preset: CompletionHaptic) => {
      if (!__DEV__ || !runtime.current.alive) return;
      stop();
      runtime.current.selected = preset;
      setSelected(preset);
      setError(null);
    },
    [stop],
  );
  const preview = useCallback(async () => {
    const state = runtime.current;
    const permitted = allowed();
    if (!__DEV__ || state.previewing || !permitted() || !current.isAvailable())
      return;
    state.previewing = true;
    setPreviewing(true);
    setError(null);
    const pending = play(permitted, true);
    const generation = state.generation;
    try {
      await pending;
    } catch {
      if (state.alive && generation === state.generation)
        setError('Couldn’t play this haptic. Please try again.');
    } finally {
      state.previewing = false;
      if (state.alive) setPreviewing(false);
    }
  }, [allowed, current, play]);

  const testing: CompletionHapticsTesting = {
    selected,
    pulsarAvailable,
    previewing,
    error,
    select,
    preview,
    stop,
  };
  return { testing, play, stop };
}
