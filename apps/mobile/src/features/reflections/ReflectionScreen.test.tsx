import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ReflectionScreen } from './ReflectionScreen';
import { AccountRepository } from '../../data/activity/repository';
import {
  MemoryStorage,
  backend,
  card,
  deferred,
  input,
  owner,
  today,
  uuid,
  zone,
} from '../../../test-support/journal';
let mockRepository: AccountRepository | null;
let storage: MemoryStorage;
let mockId: string | undefined;
let mockSource: string | undefined;
let mockSuccessId: string | null;
const mockRouter = { dismissTo: jest.fn(), back: jest.fn() };
const mockChallenges = {
  dismissSuccess: jest.fn(),
  getSnapshot: () => ({
    success: mockSuccessId ? { id: mockSuccessId } : null,
  }),
};
const mockActivity = { getRepository: () => mockRepository };
jest.mock('expo-crypto', () => ({
  randomUUID: () => '20000000-0000-4000-8000-000000000002',
}));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ attemptId: mockId, source: mockSource }),
  useRouter: () => mockRouter,
}));
jest.mock('../../app-support/providers/AppProvider', () => ({
  useRuntime: () => ({
    challenges: mockChallenges,
    activity: mockActivity,
  }),
  useJournal: () => mockRepository,
}));
beforeEach(async () => {
  storage = new MemoryStorage();
  mockRepository = new AccountRepository({
    accountId: owner,
    storage,
    transport: backend(),
    today,
    timeZone: zone,
  });
  mockRepository.setEnvironment({ active: true, online: false });
  await mockRepository.complete(input(), card);
  mockId = uuid(1);
  mockSource = undefined;
  mockSuccessId = uuid(1);
  mockChallenges.dismissSuccess.mockReset();
  mockRouter.dismissTo.mockReset();
  mockRouter.back.mockReset();
});
afterEach(() => {
  mockRepository?.dispose();
  jest.useRealTimers();
});
it('replaces the missing-activity message with a working editor after a slow journal read', async () => {
  const raw = storage.values.get(`justgo:v1:${owner}:journal`)!;
  mockRepository!.dispose();
  const read = deferred<string | null>();
  jest.spyOn(storage, 'getItem').mockImplementationOnce(() => read.promise);
  mockRepository = new AccountRepository({
    accountId: owner,
    storage,
    transport: backend(),
    today,
    timeZone: zone,
  });
  mockRepository.setEnvironment({ active: true, online: false });
  const hydration = mockRepository.hydrate();
  const screen = render(<ReflectionScreen />);
  expect(
    screen.getByText(
      'Open a completed challenge to add or edit its reflection.',
    ),
  ).toBeTruthy();
  await act(async () => {
    read.resolve(raw);
    await hydration;
  });
  expect(
    screen.queryByText(
      'Open a completed challenge to add or edit its reflection.',
    ),
  ).toBeNull();
  fireEvent.press(screen.getByRole('radio', { name: 'A lot better' }));
  fireEvent.press(screen.getByRole('button', { name: 'Save Reflection' }));
  await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1));
  expect(mockRepository.getAttempt(uuid(1))?.reflection?.feeling).toBe(
    'a_lot_better',
  );
});
it('opens a local reflection immediately and saves without HTTP gating', async () => {
  const screen = render(<ReflectionScreen />);
  expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled();
  fireEvent.press(screen.getByRole('radio', { name: 'A lot better' }));
  fireEvent.press(screen.getByRole('button', { name: 'Save Reflection' }));
  await waitFor(() => expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1));
  expect(screen.getByText('How do you feel?')).toBeTruthy();
  expect(mockRepository?.getAttempt(uuid(1))?.reflection?.feeling).toBe(
    'a_lot_better',
  );
  expect(mockChallenges.dismissSuccess).toHaveBeenCalledTimes(1);
});
it.each(['progress', 'recovery'])(
  'keeps a different completion flow when saving an older reflection from %s',
  async (source) => {
    mockSource = source;
    mockSuccessId = uuid(99);
    await mockRepository!.complete(input(99), card);
    await mockRepository!.setFlowAttempt(uuid(99));
    const screen = render(<ReflectionScreen />);
    fireEvent.changeText(
      screen.getByLabelText('Your reflection'),
      'Reviewed old reflection',
    );
    fireEvent.press(screen.getByRole('button', { name: 'Save Reflection' }));
    if (source === 'progress')
      await waitFor(() =>
        expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)/progress'),
      );
    else {
      await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    }
    expect(mockChallenges.dismissSuccess).not.toHaveBeenCalled();
    expect(mockRepository!.store.getState().flowAttemptId).toBe(uuid(99));
  },
);
it('shows slow local-save feedback, coalesces taps and retains newer typing', async () => {
  jest.useFakeTimers();
  const screen = render(<ReflectionScreen />);
  fireEvent.changeText(screen.getByLabelText('Your reflection'), 'First');
  const block = deferred<void>();
  storage.blocked = block;
  fireEvent.press(screen.getByRole('button', { name: 'Save Reflection' }));
  fireEvent.press(screen.getByRole('button', { name: 'Save Reflection' }));
  expect(screen.queryByText('Saving…')).toBeNull();
  expect(screen.queryByTestId('reflection-submit-spinner')).toBeNull();
  await act(async () => jest.advanceTimersByTimeAsync(199));
  expect(screen.queryByTestId('reflection-submit-spinner')).toBeNull();
  await act(async () => jest.advanceTimersByTimeAsync(2));
  expect(
    screen.getByRole('button', { name: 'Saving reflection' }),
  ).toBeDisabled();
  expect(screen.getByTestId('reflection-submit-spinner')).toBeTruthy();
  expect(screen.queryByText('Save Reflection')).toBeNull();
  expect(screen.queryByText('Saving…')).toBeNull();
  fireEvent.changeText(screen.getByLabelText('Your reflection'), 'Newer');
  await act(async () => block.resolve());
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Your reflection').props.value).toBe('Newer');
  expect(screen.queryByText('Saving…')).toBeNull();
  expect(screen.queryByTestId('reflection-submit-spinner')).toBeNull();
});
it('cleans delayed feedback on unmount and fences late navigation', async () => {
  jest.useFakeTimers();
  const screen = render(<ReflectionScreen />);
  fireEvent.changeText(screen.getByLabelText('Your reflection'), 'First');
  const block = deferred<void>();
  storage.blocked = block;
  fireEvent.press(screen.getByRole('button', { name: 'Save Reflection' }));
  screen.unmount();
  await act(async () => block.resolve());
  await act(async () => jest.advanceTimersByTimeAsync(201));
  expect(mockRouter.dismissTo).not.toHaveBeenCalled();
});
it('handles missing local activity without a server lookup', () => {
  mockId = undefined;
  const screen = render(<ReflectionScreen />);
  expect(
    screen.getByText(
      'Open a completed challenge to add or edit its reflection.',
    ),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Back to Home' }));
  expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)');
});
