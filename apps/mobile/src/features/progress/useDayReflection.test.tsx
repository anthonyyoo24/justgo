import {
  act,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import type { ReactElement, RefObject } from 'react';
import { Platform, Pressable, type TextInput } from 'react-native';
import { AccountRepository } from '../../data/activity/repository';
import {
  MemoryStorage,
  backend,
  owner,
  today,
  zone,
  attempt,
  deferred,
} from '../../../test-support/journal';
import { useDayReflection } from './useDayReflection';
import { DayReflectionEditor } from './DayReflectionEditor';
import { ReflectionController } from '../reflections/controller';

jest.mock('expo-crypto', () => ({
  randomUUID: () => '30000000-0000-4000-8000-000000000001',
}));
jest.mock('react-native-reanimated', () => ({ useReducedMotion: () => false }));

let repository: AccountRepository;
let storage: MemoryStorage;
beforeEach(async () => {
  storage = new MemoryStorage();
  repository = new AccountRepository({
    accountId: owner,
    storage,
    transport: backend(),
    today,
    timeZone: zone,
  });
  repository.setEnvironment({ active: true, online: false });
  await repository.hydrate();
  await repository.adoptAttempt(attempt());
});
afterEach(() => {
  storage.blocked?.resolve();
  repository.dispose();
});

it.each(['android', 'web'] as const)(
  'retains the native placeholder on %s without a duplicate visible hint',
  (platform) => {
    const os = jest.replaceProperty(Platform, 'OS', platform);
    const controller = new ReflectionController(
      repository,
      attempt().id,
      () => {},
    );
    try {
      const screen = render(
        <DayReflectionEditor
          controller={controller}
          state={controller.getSnapshot()}
          onKeepEditing={() => {}}
        />,
      );
      const input = screen.getByLabelText('Your day reflection');
      expect(input.props.placeholder).toBe('What stood out to you?');
      expect(input.props.placeholderTextColor).toBe('#6B809B');
      expect(
        screen.queryByText('What stood out to you?', {
          includeHiddenElements: true,
        }),
      ).toBeNull();
      screen.unmount();
    } finally {
      controller.dispose();
      os.restore();
    }
  },
);

it('opens an already durable row despite blocked storage and focuses once after the reveal', async () => {
  const screen = renderHook(() => useDayReflection(repository));
  const writes = storage.writes.length;
  const adopt = jest.spyOn(repository, 'adoptAttempt');
  storage.blocked = deferred<void>();
  act(() => screen.result.current.edit(attempt()));
  expect(screen.result.current.editingId).toBe(attempt().id);
  expect(adopt).not.toHaveBeenCalled();
  expect(storage.writes).toHaveLength(writes);
  const editor = screen.result.current.editor as ReactElement<{
    inputRef: RefObject<TextInput | null>;
    inputReady: boolean;
  }>;
  expect(editor.props.inputReady).toBe(false);
  const focus = jest.fn();
  editor.props.inputRef.current = { focus } as unknown as TextInput;
  expect(focus).not.toHaveBeenCalled();
  act(() => {
    screen.result.current.onEditorOpened();
    screen.result.current.onEditorOpened();
  });
  expect(focus).toHaveBeenCalledTimes(1);
  expect((screen.result.current.editor as typeof editor).props.inputReady).toBe(
    true,
  );
  screen.unmount();
  adopt.mockRestore();
});

it.each(['', 'Existing synthetic QA reflection.'])(
  'mounts the native input only after its layout reveal completes, retaining %s',
  async (initialText) => {
    const source = {
      ...attempt(),
      reflection: initialText
        ? { feeling: null, text: initialText, revision: 1 }
        : null,
    };
    await repository.adoptAttempt(source);
    function Fixture() {
      const flow = useDayReflection(repository);
      return (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open"
            onPress={() => flow.edit(source)}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reveal completed"
            onPress={flow.onEditorOpened}
          />
          {flow.editor}
        </>
      );
    }
    const screen = render(<Fixture />);
    fireEvent.press(screen.getByRole('button', { name: 'Open' }));
    expect(screen.queryByLabelText('Your day reflection')).toBeNull();
    expect(
      screen.getByTestId('reflection-editor-measurement', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    if (initialText) expect(screen.getByText(initialText)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Reveal completed' }));
    expect(screen.getByLabelText('Your day reflection').props.value).toBe(
      initialText,
    );
    if (!initialText) {
      // Keep the same Text hint through native input mounting: UILabel's
      // placeholder baseline differs from the lightweight Text preview.
      const hint = () =>
        screen.getByText('What stood out to you?', {
          includeHiddenElements: true,
        });
      expect(hint().props.pointerEvents).toBe('none');
      expect(hint().props['aria-hidden']).toBe(true);
      expect(screen.queryByText('What stood out to you?')).toBeNull();
      expect(
        screen.getByLabelText('Your day reflection').props.placeholder,
      ).toBe('What stood out to you?');
      expect(
        screen.getByLabelText('Your day reflection').props.placeholderTextColor,
      ).toBe('transparent');
      fireEvent.changeText(
        screen.getByLabelText('Your day reflection'),
        'Synthetic typed reflection.',
      );
      expect(
        screen.queryByText('What stood out to you?', {
          includeHiddenElements: true,
        }),
      ).toBeNull();
      expect(screen.getByLabelText('Your day reflection').props.value).toBe(
        'Synthetic typed reflection.',
      );
      fireEvent.changeText(screen.getByLabelText('Your day reflection'), '');
      expect(hint()).toBeTruthy();
    } else {
      expect(
        screen.queryByText('What stood out to you?', {
          includeHiddenElements: true,
        }),
      ).toBeNull();
    }
    expect(
      screen.queryByTestId('reflection-editor-measurement', {
        includeHiddenElements: true,
      }),
    ).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Cancel reflection' }));
    expect(screen.queryByLabelText('Your day reflection')).toBeNull();
    screen.unmount();
  },
);

it('allows clean close/reopen while pruning is pending and ignores the old session’s failure', async () => {
  const pruning = deferred<void>();
  const pin = jest
    .spyOn(repository, 'setFlowAttempt')
    .mockImplementationOnce((id) => {
      repository.store.setState({ flowAttemptId: id });
      return pruning.promise;
    });
  const screen = renderHook(() => useDayReflection(repository));
  act(() => screen.result.current.edit(attempt()));
  expect(screen.result.current.editingId).toBe(attempt().id);
  const closed = jest.fn();
  act(() => screen.result.current.beforeClose(closed));
  expect(closed).toHaveBeenCalledTimes(1);
  expect(screen.result.current.editingId).toBeNull();
  act(() => screen.result.current.edit(attempt()));
  expect(screen.result.current.editingId).toBe(attempt().id);
  await act(async () => {
    pruning.reject(new Error('Pruning unavailable'));
    await pruning.promise.catch(() => {});
  });
  expect(screen.result.current.error).toBeNull();
  screen.unmount();
  pin.mockRestore();
});

it('ignores a late reveal callback after clean close and for an inactive account', async () => {
  const screen = renderHook(() => useDayReflection(repository));
  act(() => screen.result.current.edit(attempt()));
  await waitFor(() => expect(screen.result.current.editor).not.toBeNull());
  const editor = screen.result.current.editor as ReactElement<{
    inputRef: RefObject<TextInput | null>;
  }>;
  const focus = jest.fn();
  editor.props.inputRef.current = { focus } as unknown as TextInput;
  const late = screen.result.current.onEditorOpened;
  act(() => screen.result.current.beforeClose(() => {}));
  expect(screen.result.current.editingId).toBeNull();
  act(late);
  expect(focus).not.toHaveBeenCalled();
  act(() => screen.result.current.edit(attempt()));
  await waitFor(() => expect(screen.result.current.editor).not.toBeNull());
  act(() => repository.setEnvironment({ active: false, online: false }));
  act(() => screen.result.current.onEditorOpened());
  expect(focus).not.toHaveBeenCalled();
  screen.unmount();
});

it('does not mount an editor when the account deactivates during older-row adoption', async () => {
  const adoption = deferred<void>();
  const adopt = jest
    .spyOn(repository, 'adoptAttempt')
    .mockReturnValueOnce(adoption.promise);
  const screen = renderHook(() => useDayReflection(repository));
  act(() => screen.result.current.edit(attempt(2)));
  await waitFor(() => expect(adopt).toHaveBeenCalled());
  act(() => repository.setEnvironment({ active: false, online: false }));
  await act(async () => {
    adoption.resolve();
    await adoption.promise;
  });
  expect(screen.result.current.editor).toBeNull();
  expect(repository.store.getState().flowAttemptId).toBeNull();
  screen.unmount();
  adopt.mockRestore();
});
