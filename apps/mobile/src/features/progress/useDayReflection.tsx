import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { TextInput } from 'react-native';
import type { Attempt } from '@justgo/contracts';
import type { AccountRepository } from '../../data/activity/repository';
import { ReflectionController } from '../reflections/controller';
import { DayReflectionEditor } from './DayReflectionEditor';

export function useDayReflection(repository: AccountRepository) {
  const [session, setSession] = useState<{
    attemptId: string;
    controller: ReflectionController;
  } | null>(null);
  const controller = session?.controller ?? null;
  const editingId = session?.attemptId ?? null;
  const focusedController = useRef<ReflectionController | null>(null);
  const [revealedController, setRevealedController] =
    useState<ReflectionController | null>(null);
  const activeController = useRef<ReflectionController | null>(null);
  const preparationGeneration = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const afterClose = useRef<(() => void) | null>(null);
  const inputRef = useRef<TextInput>(null);
  const opening = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const finish = useCallback(() => {
    preparationGeneration.current += 1;
    setSession(null);
    setRevealedController(null);
    // Pinning protects older rows during aggregate pruning; release owns errors.
    void repository.setFlowAttempt(null).catch(() => {
      if (alive.current) setError('Couldn’t close this reflection.');
    });
    const work = afterClose.current;
    afterClose.current = null;
    work?.();
  }, [repository]);
  useEffect(() => {
    activeController.current = controller;
    controller?.connect();
    return () => {
      activeController.current = null;
      controller?.dispose();
      if (editingId && repository.store.getState().flowAttemptId === editingId)
        void repository.setFlowAttempt(null).catch(() => {});
    };
  }, [controller, repository, editingId]);
  const state = useSyncExternalStore(
    controller?.subscribe ?? (() => () => {}),
    controller?.getSnapshot ?? (() => null),
    controller?.getSnapshot ?? (() => null),
  );
  const beforeClose = (work: () => void) => {
    if (opening.current || state?.submitting) return;
    if (!controller) {
      work();
      return;
    }
    afterClose.current = work;
    controller.close();
  };
  const edit = (attempt: Attempt) =>
    beforeClose(() => {
      const generation = ++preparationGeneration.current;
      opening.current = true;
      setError(null);
      const activate = () => {
        if (!alive.current || !repository.store.getState().active) return false;
        setSession({
          attemptId: attempt.id,
          controller: new ReflectionController(repository, attempt.id, finish, {
            isCurrent: () => repository.store.getState().active,
          }),
        });
        return true;
      };
      if (repository.hasCurrentAttempt(attempt)) {
        // Pinning is synchronous; pruning unrelated old rows can finish in the
        // background. Batch editor activation with the tap, without an await
        // that first renders the entire Progress screen in its closed state.
        const pinned = repository.setFlowAttempt(attempt.id);
        if (!activate()) void repository.setFlowAttempt(null).catch(() => {});
        opening.current = false;
        void pinned.catch(() => {
          if (
            alive.current &&
            preparationGeneration.current === generation &&
            repository.store.getState().flowAttemptId === attempt.id
          )
            setError('Couldn’t prepare this reflection. Please try again.');
        });
        return;
      }
      // Adopt fetched older history only for an explicit edit. Ordinary reads do
      // not persist older details. Account disposal fences the asynchronous work.
      void (async () => {
        await repository.setFlowAttempt(attempt.id);
        await repository.adoptAttempt(attempt);
        if (
          !activate() &&
          repository.store.getState().flowAttemptId === attempt.id
        ) {
          await repository.setFlowAttempt(null);
        }
      })()
        .catch(() => {
          if (repository.store.getState().flowAttemptId === attempt.id)
            void repository.setFlowAttempt(null).catch(() => {});
          if (alive.current)
            setError('Couldn’t open this reflection. Please try again.');
        })
        .finally(() => {
          opening.current = false;
        });
    });
  const onEditorOpened = useCallback(() => {
    if (
      !alive.current ||
      !repository.store.getState().active ||
      !controller ||
      activeController.current !== controller ||
      focusedController.current === controller
    )
      return;
    setRevealedController(controller);
  }, [controller, repository]);
  useEffect(() => {
    // Mounting the native input itself can stall the UI thread on first use.
    // Reveal its lightweight layout first, then focus after the input commits.
    if (
      revealedController !== controller ||
      !controller ||
      !alive.current ||
      !repository.store.getState().active ||
      activeController.current !== controller ||
      focusedController.current === controller ||
      !inputRef.current
    )
      return;
    focusedController.current = controller;
    inputRef.current.focus();
  }, [controller, repository, revealedController]);
  return {
    editingId,
    error,
    edit,
    beforeClose,
    onEditorOpened,
    editor:
      controller && state ? (
        <DayReflectionEditor
          controller={controller}
          state={state}
          inputRef={inputRef}
          inputReady={revealedController === controller}
          onKeepEditing={() => {
            afterClose.current = null;
            controller.keepEditing();
            inputRef.current?.focus();
          }}
        />
      ) : null,
  };
}
