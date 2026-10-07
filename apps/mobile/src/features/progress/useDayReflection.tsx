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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [controller, setController] = useState<ReflectionController | null>(
    null,
  );
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
    setEditingId(null);
    setController(null);
    // Pinning protects older rows during aggregate pruning; release owns errors.
    void repository.setFlowAttempt(null).catch(() => {
      if (alive.current) setError('Couldn’t close this reflection.');
    });
    const work = afterClose.current;
    afterClose.current = null;
    work?.();
  }, [repository]);
  useEffect(() => {
    controller?.connect();
    return () => {
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
      opening.current = true;
      setError(null);
      // Adopt fetched older history only for an explicit edit. Ordinary reads do
      // not persist older details. Account disposal fences the asynchronous work.
      void (async () => {
        await repository.setFlowAttempt(attempt.id);
        await repository.adoptAttempt(attempt);
        if (alive.current && repository.store.getState().active) {
          setController(
            new ReflectionController(repository, attempt.id, finish, {
              isCurrent: () => repository.store.getState().active,
            }),
          );
          setEditingId(attempt.id);
        } else if (repository.store.getState().flowAttemptId === attempt.id) {
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
  return {
    editingId,
    error,
    edit,
    beforeClose,
    editor:
      controller && state ? (
        <DayReflectionEditor
          controller={controller}
          state={state}
          inputRef={inputRef}
          onKeepEditing={() => {
            afterClose.current = null;
            controller.keepEditing();
            inputRef.current?.focus();
          }}
        />
      ) : null,
  };
}
