import {
  act,
  fireEvent,
  render,
  renderHook,
  waitFor,
} from '@testing-library/react-native';
import type { ReactElement, RefObject } from 'react';
import { Platform, Pressable, StyleSheet, type TextInput } from 'react-native';
import { AccountRepository } from '../../../../data/activity/repository';
import {
  MemoryStorage,
  backend,
  owner,
  today,
  zone,
  attempt,
  deferred,
} from '../../../../../test-support/journal';
import { useDayReflection } from './useDayReflection';
import { DayReflectionEditor } from './DayReflectionEditor';
import { ReflectionController } from '../../../reflections/controller';
import { DayReflectionViewport } from '../useDayReflectionKeyboard';

jest.mock('expo-crypto', () => ({
  randomUUID: () => '30000000-0000-4000-8000-000000000001',
}));
jest.mock('../../../../platform/motion/motion', () => ({
  useReduceMotion: () => false,
}));

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

it('keeps typing and dirty-close state inside the editor without rendering its screen owner', async () => {
  const ownerRender = jest.fn();
  const leave = jest.fn();
  function Fixture() {
    ownerRender();
    const flow = useDayReflection(repository);
    return (
      <>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open"
          onPress={() => flow.edit(attempt())}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Reveal"
          onPress={flow.onEditorOpened}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leave"
          onPress={() => flow.beforeClose(leave)}
        />
        {flow.editor}
      </>
    );
  }
  const screen = await render(<Fixture />);
  await fireEvent.press(screen.getByRole('button', { name: 'Open' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Reveal' }));
  ownerRender.mockClear();
  await fireEvent.changeText(
    screen.getByLabelText('Your day reflection'),
    'Disposable draft',
  );
  expect(screen.getByLabelText('Your day reflection').props.value).toBe(
    'Disposable draft',
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Leave' }));
  expect(screen.getByText('Leave your reflection?')).toBeTruthy();
  expect(ownerRender).not.toHaveBeenCalled();
  expect(leave).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Your day reflection').props.value).toBe(
    'Disposable draft',
  );
  expect(ownerRender).not.toHaveBeenCalled();
  await screen.unmount();
});

it.each(['android', 'web'] as const)(
  'retains the native placeholder on %s without a duplicate visible hint',
  async (platform) => {
    const os = jest.replaceProperty(Platform, 'OS', platform);
    const controller = new ReflectionController(
      repository,
      attempt().id,
      () => {},
    );
    try {
      const screen = await render(
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
      await screen.unmount();
    } finally {
      controller.dispose();
      os.restore();
    }
  },
);

it('opens an already durable row despite blocked storage and focuses once after the reveal', async () => {
  const screen = await renderHook(() => useDayReflection(repository));
  const writes = storage.writes.length;
  const adopt = jest.spyOn(repository, 'adoptAttempt');
  storage.blocked = deferred<void>();
  await act(() => screen.result.current.edit(attempt()));
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
  await act(() => {
    screen.result.current.onEditorOpened();
    screen.result.current.onEditorOpened();
  });
  expect(focus).toHaveBeenCalledTimes(1);
  expect((screen.result.current.editor as typeof editor).props.inputReady).toBe(
    true,
  );
  await screen.unmount();
  adopt.mockRestore();
});

it.each(['', 'Existing synthetic QA reflection.'])(
  'prepares saved text in its real input while staging an empty form, retaining %s',
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
    const screen = await render(<Fixture />);
    await fireEvent.press(screen.getByRole('button', { name: 'Open' }));
    if (initialText) {
      expect(screen.getByLabelText('Your day reflection').props.value).toBe(
        initialText,
      );
      expect(
        screen.queryByTestId('reflection-editor-measurement', {
          includeHiddenElements: true,
        }),
      ).toBeNull();
      // An early tap/clear must keep this mounted input through the reveal.
      await fireEvent.changeText(
        screen.getByLabelText('Your day reflection'),
        '',
      );
      expect(screen.getByLabelText('Your day reflection').props.value).toBe('');
      await fireEvent.changeText(
        screen.getByLabelText('Your day reflection'),
        initialText,
      );
    } else {
      expect(screen.queryByLabelText('Your day reflection')).toBeNull();
      expect(
        screen.getByTestId('reflection-editor-measurement', {
          includeHiddenElements: true,
        }),
      ).toBeTruthy();
    }
    await fireEvent.press(
      screen.getByRole('button', { name: 'Reveal completed' }),
    );
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
      await fireEvent.changeText(
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
      await fireEvent.changeText(
        screen.getByLabelText('Your day reflection'),
        '',
      );
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
    await fireEvent.press(
      screen.getByRole('button', { name: 'Cancel reflection' }),
    );
    expect(screen.queryByLabelText('Your day reflection')).toBeNull();
    await screen.unmount();
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
  const screen = await renderHook(() => useDayReflection(repository));
  await act(() => screen.result.current.edit(attempt()));
  expect(screen.result.current.editingId).toBe(attempt().id);
  const closed = jest.fn();
  await act(() => screen.result.current.beforeClose(closed));
  expect(closed).toHaveBeenCalledTimes(1);
  expect(screen.result.current.editingId).toBeNull();
  await act(() => screen.result.current.edit(attempt()));
  expect(screen.result.current.editingId).toBe(attempt().id);
  await act(async () => {
    pruning.reject(new Error('Pruning unavailable'));
    await pruning.promise.catch(() => {});
  });
  expect(screen.result.current.error).toBeNull();
  await screen.unmount();
  pin.mockRestore();
});

it('ignores a late reveal callback after clean close and for an inactive account', async () => {
  const screen = await renderHook(() => useDayReflection(repository));
  await act(() => screen.result.current.edit(attempt()));
  await waitFor(() => expect(screen.result.current.editor).not.toBeNull());
  const editor = screen.result.current.editor as ReactElement<{
    inputRef: RefObject<TextInput | null>;
  }>;
  const focus = jest.fn();
  editor.props.inputRef.current = { focus } as unknown as TextInput;
  const late = screen.result.current.onEditorOpened;
  await act(() => screen.result.current.beforeClose(() => {}));
  expect(screen.result.current.editingId).toBeNull();
  await act(late);
  expect(focus).not.toHaveBeenCalled();
  await act(() => screen.result.current.edit(attempt()));
  await waitFor(() => expect(screen.result.current.editor).not.toBeNull());
  await act(() => repository.setEnvironment({ active: false, online: false }));
  await act(() => screen.result.current.onEditorOpened());
  expect(focus).not.toHaveBeenCalled();
  await screen.unmount();
});

it('does not mount an editor when the account deactivates during older-row adoption', async () => {
  const adoption = deferred<void>();
  const adopt = jest
    .spyOn(repository, 'adoptAttempt')
    .mockReturnValueOnce(adoption.promise);
  const screen = await renderHook(() => useDayReflection(repository));
  await act(() => screen.result.current.edit(attempt(2)));
  await waitFor(() => expect(adopt).toHaveBeenCalled());
  await act(() => repository.setEnvironment({ active: false, online: false }));
  await act(async () => {
    adoption.resolve();
    await adoption.promise;
  });
  expect(screen.result.current.editor).toBeNull();
  expect(repository.store.getState().flowAttemptId).toBeNull();
  await screen.unmount();
  adopt.mockRestore();
});

it('bounds long writing to leave room for measured actions and errors as the viewport shrinks', async () => {
  const controller = new ReflectionController(
    repository,
    attempt().id,
    () => {},
  );
  controller.setText('Disposable long reflection. '.repeat(100));
  const state = controller.getSnapshot();
  const renderEditor = (height: number) => (
    <DayReflectionViewport.Provider value={height}>
      <DayReflectionEditor
        controller={controller}
        state={state}
        onKeepEditing={() => {}}
      />
    </DayReflectionViewport.Provider>
  );
  const screen = await render(renderEditor(400));
  const input = () => screen.getByLabelText('Your day reflection');
  expect(StyleSheet.flatten(input().props.style)).toMatchObject({
    minHeight: 76,
    maxHeight: 160,
  });
  await screen.rerender(renderEditor(200));
  expect(StyleSheet.flatten(input().props.style).maxHeight).toBe(108);
  await fireEvent(screen.getByTestId('day-reflection-actions'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 340, height: 86 } },
  });
  expect(StyleSheet.flatten(input().props.style).maxHeight).toBe(78);
  expect(78 + 86 + 36).toBe(200);
  await screen.rerender(renderEditor(180));
  expect(StyleSheet.flatten(input().props.style)).toMatchObject({
    minHeight: 58,
    maxHeight: 58,
  });
  expect(input().props.scrollEnabled).toBe(true);
  expect(input().props.value).toBe(state.text);
  expect(screen.getByRole('button', { name: 'Save reflection' })).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'Cancel reflection' }),
  ).toBeTruthy();
  await screen.unmount();
  controller.dispose();
});
