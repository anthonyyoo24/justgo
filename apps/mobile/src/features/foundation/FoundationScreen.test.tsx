import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { FoundationScreen } from './FoundationScreen';
import type { ConnectionResult } from './connection';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));
jest.mock('expo-image', () => ({ Image: require('react-native').Image }));

it('checks the connection, prevents duplicate requests, and supports retry after failure', async () => {
  let resolve: (result: ConnectionResult) => void = () => {};
  const probe = jest
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<ConnectionResult>((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValueOnce('ready');
  render(<FoundationScreen probe={probe} />);
  fireEvent.press(screen.getByRole('button', { name: 'Check connection' }));
  expect(screen.getByRole('button', { name: 'Checking…' })).toBeDisabled();
  fireEvent.press(screen.getByRole('button', { name: 'Checking…' }));
  expect(probe).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve('unavailable');
  });
  await waitFor(() =>
    expect(
      screen.getByText(
        'Couldn’t connect. Check your connection and try again.',
      ),
    ).toBeTruthy(),
  );
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Check again' }));
  });
  await waitFor(() =>
    expect(screen.getByText('Connected. Everything is ready.')).toBeTruthy(),
  );
});

it('explains a missing environment without implying that the service is healthy', async () => {
  render(
    <FoundationScreen probe={jest.fn().mockResolvedValue('unconfigured')} />,
  );
  await act(async () => {
    fireEvent.press(screen.getByRole('button', { name: 'Check connection' }));
  });
  await waitFor(() =>
    expect(screen.getByText(/Add the API address/)).toBeTruthy(),
  );
});
