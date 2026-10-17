import {
  harness,
  connected,
  AccountToolRoute,
} from '../../../../test-support/identity/account';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { AppState, Dimensions, type AppStateStatus } from 'react-native';

import RecoveryRoute from '../../../app/recovery';

import { IdentityController } from '../controller';

import { createIdentityApi } from '../api';

import { createMemoryVault } from '../storage';

it('explains transfer entry for phones with and without an account', async () => {
  const { fetcher } = await connected();
  harness.mockTool = 'transfer';
  const source = render(<AccountToolRoute />);
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().busy).toBe(false),
  );
  expect(
    source.getByText(
      /Open JustGO on your new phone and choose “Transfer from another device.”/,
    ),
  ).toBeTruthy();
  expect(
    source.getByText(
      /If that phone already has an account, go to Settings → Account & recovery → Recovery keys → Recover an existing account first/,
    ),
  ).toBeTruthy();
  source.unmount();

  harness.mockController = new IdentityController(
    createMemoryVault(),
    createIdentityApi('http://localhost:3000', fetcher as typeof fetch),
  );
  await harness.mockController.initialize();
  const newPhone = render(<RecoveryRoute />);
  expect(
    newPhone.getByRole('button', { name: 'Transfer from another device' }),
  ).toBeEnabled();
  expect(newPhone.queryByRole('link', { name: 'Recovery keys' })).toBeNull();
  newPhone.unmount();
});

it('preserves transfer input when the system text size changes', async () => {
  await connected();
  harness.mockTool = 'transfer';
  const originalWindow = Dimensions.get('window');
  const screen = render(<AccountToolRoute />);
  await waitFor(() =>
    expect(harness.mockController.getSnapshot().busy).toBe(false),
  );
  const input = screen.getByLabelText('Transfer code');
  fireEvent.changeText(input, 'TEST-CODE');
  try {
    act(() =>
      Dimensions.set({ window: { ...originalWindow, fontScale: 3.57 } }),
    );
    expect(screen.getByLabelText('Transfer code') === input).toBe(true);
    expect(input.props.value).toBe('TEST-CODE');
    expect(
      screen.getByRole('button', { name: 'Review transfer' }),
    ).toBeEnabled();
  } finally {
    act(() => Dimensions.set({ window: originalWindow }));
  }
});

it('hides outgoing transfer codes if the app backgrounds during navigation', async () => {
  await connected();
  let onState!: (state: AppStateStatus) => void;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      onState = listener;
      return { remove: jest.fn() };
    });
  await harness.mockController.startTransfer();
  harness.mockTool = 'recover';
  const screen = render(<AccountToolRoute />);
  try {
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('012345')).toBeTruthy();
    act(() => onState('inactive'));
    expect(screen.queryByText('012345')).toBeNull();
  } finally {
    await act(async () => harness.mockController.cancelTransfer());
    screen.unmount();
  }
});

it('keeps the account hub quiet during cancellation and reports a settled cleanup failure', async () => {
  const { controls } = await connected();
  const screen = render(<RecoveryRoute />);
  const account = screen.getByText('Account');
  const recovery = screen.getByText('Recovery');
  const devices = screen.getByRole('header', { name: 'Devices' });
  await act(async () => harness.mockController.startTransfer());
  let release!: () => void, reject!: (error: Error) => void;
  controls.holdRequest = {
    path: `/transfers/${harness.mockController.getSnapshot().transfer!.id}`,
    method: 'DELETE',
    gate: new Promise<void>((resolve, fail) => {
      release = resolve;
      reject = fail;
    }),
  };
  try {
    act(() => {
      void harness.mockController.cancelTransfer();
    });
    await waitFor(() =>
      expect(harness.mockController.getSnapshot().cancellationPending).toBe(
        true,
      ),
    );
    expect(screen.queryByRole('alert')).toBeNull();
    await act(async () => {
      reject(new Error('Synthetic cancellation outage'));
      await harness.mockController.cancelTransfer();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /Server confirmation is pending/,
    );
    expect(screen.getByText('Account')).toBe(account);
    expect(screen.getByText('Recovery')).toBe(recovery);
    expect(screen.getByRole('header', { name: 'Devices' })).toBe(devices);
  } finally {
    controls.holdRequest = null;
    await act(async () => {
      release();
      await harness.mockController.cancelTransfer();
      await harness.mockController.retry();
    });
    screen.unmount();
  }
});

it.each(['back', 'focus loss', 'inactive', 'background', 'unmount'] as const)(
  'cancels an unfinished receiving transfer on %s and reopens the normal account hub',
  async (exit) => {
    const { vault, fetcher } = await connected();
    const original = harness.mockController.getSnapshot().account;
    let appState: ((state: AppStateStatus) => void) | undefined;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        appState = listener;
        return { remove: jest.fn() };
      });
    await harness.mockController.startTransfer();
    const pending = (await vault.read())!.pending;
    if (pending?.kind !== 'transfer')
      throw new Error('Missing transfer fixture');
    harness.mockTool = 'recover';
    const screen = render(<AccountToolRoute />);
    expect(screen.getByText('012345')).toBeTruthy();
    if (exit === 'back') {
      fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      expect(harness.mockRouter.dismissTo).toHaveBeenCalledWith('/recovery');
    } else if (exit === 'focus loss') {
      harness.mockFocused = false;
      screen.rerender(<AccountToolRoute />);
    } else if (exit === 'unmount') screen.unmount();
    else act(() => appState!(exit));
    await act(async () => {
      await harness.mockController.cancelTransfer();
    });
    expect((await vault.read())!.pending).toBeNull();
    expect(harness.mockController.getSnapshot().transfer).toBeNull();
    expect(harness.mockController.getSnapshot().account).toEqual(original);
    expect(
      fetcher.mock.calls.filter(
        ([url, init]) =>
          url.toString().endsWith(`/transfers/${pending.input.id}`) &&
          init?.method === 'DELETE',
      ),
    ).toHaveLength(1);
    if (exit !== 'unmount') screen.unmount();
    harness.mockFocused = true;
    const reopened = render(<RecoveryRoute />);
    expect(
      reopened.getByRole('link', { name: 'Move to another phone' }),
    ).toBeTruthy();
    expect(reopened.queryByText('012345')).toBeNull();
    reopened.unmount();
  },
);
