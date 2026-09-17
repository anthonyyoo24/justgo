import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { IdentityScreen } from './IdentityScreen';
import { IdentityController } from './controller';
import { createMemoryVault } from './storage';
import { IdentityClientError, type IdentityApi } from './api';

jest.mock('expo-crypto', () => ({
  getRandomValues: () => new Uint8Array(32).fill(1),
  randomUUID: () => '00000000-0000-4000-8000-000000000001',
}));
jest.mock('./vault', () => ({ createVault: jest.fn() }));
it('shows the browser limitation, recovery inputs, busy state and recoverable failure', async () => {
  let rejectRequest: ((error: unknown) => void) | undefined;
  const api: IdentityApi = {
    request: () =>
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
  };
  const controller = new IdentityController(createMemoryVault(), api);
  const screen = render(<IdentityScreen controller={controller} />);
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Create a private account' }),
    ).toBeTruthy(),
  );
  expect(screen.getByText(/Browser testing only/)).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', { name: 'Create a private account' }),
  );
  await waitFor(() => expect(rejectRequest).toBeDefined());
  expect(
    screen.getByRole('button', { name: 'Recover an existing account' }).props
      .accessibilityState.disabled,
  ).toBe(true);
  rejectRequest!(new IdentityClientError('NETWORK'));
  await waitFor(() =>
    expect(screen.getByText(/Couldn’t connect/)).toBeTruthy(),
  );
  expect(
    screen.queryByRole('button', { name: 'Create a private account' }),
  ).toBeNull();
  fireEvent.press(
    screen.getByRole('button', { name: 'Recover an existing account' }),
  );
  expect(screen.getByLabelText('Recovery key').props.secureTextEntry).toBe(
    true,
  );
  expect(screen.getByRole('button', { name: 'Retry connection' })).toBeTruthy();
  fireEvent.press(
    screen.getByRole('button', { name: 'Create a separate empty account' }),
  );
  expect(
    screen.getByText(/Existing accounts and credentials will be kept separate/),
  ).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
});
