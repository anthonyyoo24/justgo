import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ReflectionScreen } from './ReflectionScreen';

const mockRequest = jest.fn();
const mockRouter = { dismissTo: jest.fn() };
const mockRuntime = {
  client: { request: mockRequest },
  challenges: { dismissSuccess: jest.fn(), getSnapshot: jest.fn() },
};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ attemptId: 'first' }),
  useRouter: () => mockRouter,
}));
jest.mock('../shell/AppProvider', () => ({
  useRuntime: () => mockRuntime,
}));

beforeEach(() => {
  mockRequest.mockReset();
  mockRouter.dismissTo.mockReset();
  mockRuntime.challenges.dismissSuccess.mockReset();
  mockRuntime.challenges.getSnapshot.mockReturnValue({ success: null });
});

it('keeps the reflection visible until navigation completes after saving', async () => {
  mockRuntime.challenges.getSnapshot.mockReturnValue({
    success: { id: 'first' },
  });
  mockRequest.mockResolvedValueOnce({});
  const screen = render(<ReflectionScreen />);

  fireEvent.press(screen.getByRole('radio', { name: 'A lot better' }));
  fireEvent.press(screen.getByRole('button', { name: 'Save Reflection' }));

  await waitFor(() =>
    expect(mockRouter.dismissTo).toHaveBeenCalledWith('/(tabs)'),
  );
  expect(screen.getByText('How do you feel?')).toBeTruthy();
  expect(
    screen.queryByText('This reflection has already been finished.'),
  ).toBeNull();
});

it('opens a just-completed reflection ready to edit without fetching it', () => {
  mockRuntime.challenges.getSnapshot.mockReturnValue({
    success: { id: 'first' },
  });
  const screen = render(<ReflectionScreen />);

  expect(screen.getByText('How do you feel?')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled();
  expect(screen.getByLabelText('Your reflection').props.editable).toBe(true);
  expect(screen.queryByTestId('reflection-submit-spinner')).toBeNull();
  expect(mockRequest).not.toHaveBeenCalled();
});

it('keeps the reflection form on screen while its first request loads', async () => {
  let resolve!: (value: unknown) => void;
  mockRequest.mockImplementationOnce(
    () => new Promise((done) => (resolve = done)),
  );
  const screen = render(<ReflectionScreen />);

  expect(screen.getByText('How do you feel?')).toBeTruthy();
  expect(screen.queryByText('Loading your reflection…')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Loading reflection' }),
  ).toBeDisabled();
  expect(screen.getByTestId('reflection-submit-spinner')).toBeTruthy();
  expect(screen.getByLabelText('Your reflection').props.editable).toBe(false);
  expect(
    screen
      .getAllByRole('radio')
      .every((radio) => radio.props.accessibilityState.disabled),
  ).toBe(true);

  await act(async () =>
    resolve({
      attemptId: 'first',
      revision: 0,
      status: 'none',
      feelingVersion: 1,
      feeling: null,
      text: null,
      inputMethod: null,
      updatedAt: null,
    }),
  );

  expect(screen.getByText('How do you feel?')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Skip' })).toBeEnabled();
  expect(screen.queryByTestId('reflection-submit-spinner')).toBeNull();
  expect(screen.getByLabelText('Your reflection').props.editable).toBe(true);
});
