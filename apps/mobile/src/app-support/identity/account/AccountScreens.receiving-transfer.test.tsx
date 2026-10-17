import {
  harness,
  connected,
  AccountToolRoute,
} from '../../../../test-support/identity/account';
import {
  act,
  fireEvent,
  render,
  waitFor,
  within,
} from '@testing-library/react-native';

import { IdentityClientError } from '../api';

it('offers explicit existing-account recovery at its static route', async () => {
  await connected();
  harness.mockTool = 'recover';
  const screen = render(<AccountToolRoute />);
  expect(screen.getByLabelText('Recovery key').props.secureTextEntry).toBe(
    true,
  );
  expect(screen.queryByRole('button', { name: 'Refresh account' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Recover with key' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Get help' })).toBeNull();
  expect(screen.queryByText('JustGO · Your account, kept private')).toBeNull();
});

it('confirms receiving a transfer from a connected account, preserves Cancel and finishes recovery', async () => {
  const { fetcher, controls, vault } = await connected();
  const original = harness.mockController.getSnapshot().account;
  const originalCredentials = await vault.credentials();
  harness.mockTool = 'recover';
  const screen = render(<AccountToolRoute />);
  const transfer = () =>
    screen.getByRole('button', { name: 'Transfer from another device' });
  const transferRequests = () =>
    fetcher.mock.calls.filter(([url]) => url.toString().endsWith('/transfers'));
  fireEvent.press(transfer());
  expect(
    screen.getByText(/Transfer an account from another device/),
  ).toBeTruthy();
  expect(screen.queryByText('Transfer from another device')).toBeNull();
  expect(harness.mockController.getSnapshot().account).toEqual(original);
  expect(transferRequests()).toHaveLength(0);
  fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
  expect(transfer()).toBeEnabled();
  expect(harness.mockController.getSnapshot().account).toEqual(original);
  expect(transferRequests()).toHaveLength(0);

  const recoveryInput = screen.getByLabelText('Recovery key');
  let release!: () => void;
  controls.holdRequest = {
    path: '/transfers',
    method: 'POST',
    gate: new Promise<void>((resolve) => {
      release = resolve;
    }),
  };
  try {
    fireEvent.press(transfer());
    fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
    await waitFor(() => expect(transferRequests()).toHaveLength(1));
    expect(screen.queryByText('Transfer from another device')).toBeNull();
    expect(screen.getByLabelText('Recovery key')).toBe(recoveryInput);
    expect(
      screen.getByText(/Transfer an account from another device/),
    ).toBeTruthy();
    const confirm = screen.getByRole('button', { name: 'Confirm' });
    expect(confirm).toBeDisabled();
    expect(confirm.props.accessibilityState.busy).toBe(true);
    expect(
      screen.getByRole('progressbar', { name: 'Confirm in progress' }),
    ).toBeTruthy();
    expect(
      within(confirm).getByRole('progressbar', { name: 'Confirm in progress' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
    expect(
      screen.queryByRole('progressbar', {
        name: 'Transfer from another device in progress',
      }),
    ).toBeNull();
    expect(screen.queryByText(/Enter this transfer code/)).toBeNull();
    fireEvent.press(confirm);
    expect(transferRequests()).toHaveLength(1);
  } finally {
    await act(async () => release());
    await waitFor(() =>
      expect(harness.mockController.getSnapshot().busy).toBe(false),
    );
  }
  expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
  expect(screen.getByText('012345')).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'Transfer from another device' }),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: 'Retry connection' })).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Start a new transfer' }),
  ).toBeEnabled();
  expect(screen.queryByLabelText('Recovery key')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'Create a separate empty account' }),
  ).toBeNull();
  expect(await vault.credentials()).toEqual(
    expect.arrayContaining(originalCredentials),
  );
  let finishLists!: () => void;
  controls.holdRequest = {
    path: '/devices',
    method: 'GET',
    gate: new Promise<void>((resolve) => {
      finishLists = resolve;
    }),
  };
  try {
    fireEvent.press(
      screen.getByRole('button', { name: 'Check approval & finish' }),
    );
    await waitFor(() =>
      expect(harness.mockController.getSnapshot().account?.userId).toBe(
        '30000000-0000-4000-8000-000000000004',
      ),
    );
    expect(harness.mockController.getSnapshot().busy).toBe(true);
    expect(screen.queryByText('Redirect: /recovery')).toBeNull();
    expect(harness.mockRouter.replace).not.toHaveBeenCalled();
  } finally {
    await act(async () => finishLists());
    await waitFor(() =>
      expect(harness.mockController.getSnapshot().busy).toBe(false),
    );
  }
  await waitFor(() =>
    expect(harness.mockRouter.replace).toHaveBeenCalledWith('/recovery'),
  );
  expect(harness.mockController.getSnapshot().account?.userId).toBe(
    '30000000-0000-4000-8000-000000000004',
  );
  expect(await vault.credentials()).toEqual(
    expect.arrayContaining(originalCredentials),
  );
  expect(harness.mockRouter.replace).toHaveBeenCalledWith('/recovery');
});

it.each(['TRANSFER_PENDING', 'NETWORK', 'TRANSFER_EXPIRED'] as const)(
  'keeps recovery actions usable after %s without duplicate transfer controls',
  async (code) => {
    const { fetcher } = await connected();
    await harness.mockController.startTransfer();
    harness.mockTool = 'recover';
    const screen = render(<AccountToolRoute />);
    try {
      fetcher.mockRejectedValueOnce(new IdentityClientError(code));
      fireEvent.press(
        screen.getByRole('button', { name: 'Check approval & finish' }),
      );
      await waitFor(() =>
        expect(harness.mockController.getSnapshot().busy).toBe(false),
      );
      expect(screen.getByText('012345')).toBeTruthy();
      expect(
        screen.getByText(
          code === 'TRANSFER_PENDING'
            ? /Waiting for approval/
            : code === 'NETWORK'
              ? /Couldn’t connect/
              : /This transfer expired/,
        ),
      ).toBeTruthy();
      expect(
        screen.queryByRole('button', { name: 'Transfer from another device' }),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Retry connection' }),
      ).toBeNull();
      expect(
        screen.getByRole('button', { name: 'Start a new transfer' }),
      ).toBeEnabled();
      const finishing = screen.getByRole('button', {
        name: 'Check approval & finish',
      });
      expect(finishing).toBeEnabled();
      if (code !== 'TRANSFER_EXPIRED') {
        fireEvent.press(finishing);
        await waitFor(() =>
          expect(harness.mockRouter.replace).toHaveBeenCalledWith('/recovery'),
        );
      } else {
        const previousTransferId =
          harness.mockController.getSnapshot().transfer!.id;
        fireEvent.press(
          screen.getByRole('button', { name: 'Start a new transfer' }),
        );
        await waitFor(() =>
          expect(harness.mockController.getSnapshot().busy).toBe(false),
        );
        expect(harness.mockController.getSnapshot().transfer!.id).not.toBe(
          previousTransferId,
        );
        expect(screen.queryByText(/This transfer expired/)).toBeNull();
      }
    } finally {
      await act(async () => harness.mockController.cancelTransfer());
      screen.unmount();
    }
  },
);

it.each(['failure', 'back'] as const)(
  'clears Confirm loading safely after %s during transfer start',
  async (outcome) => {
    const { controls, vault, fetcher } = await connected();
    const original = harness.mockController.getSnapshot().account;
    let release!: () => void, reject!: (error: Error) => void;
    controls.holdRequest = {
      path: '/transfers',
      method: 'POST',
      gate: new Promise<void>((resolve, fail) => {
        release = resolve;
        reject = fail;
      }),
    };
    harness.mockTool = 'recover';
    const screen = render(<AccountToolRoute />);
    try {
      fireEvent.press(
        screen.getByRole('button', { name: 'Transfer from another device' }),
      );
      fireEvent.press(screen.getByRole('button', { name: 'Confirm' }));
      await waitFor(() =>
        expect(
          fetcher.mock.calls.some(([url]) =>
            url.toString().endsWith('/transfers'),
          ),
        ).toBe(true),
      );
      expect(
        within(screen.getByRole('button', { name: 'Confirm' })).getByRole(
          'progressbar',
          { name: 'Confirm in progress' },
        ),
      ).toBeTruthy();
      if (outcome === 'failure') {
        await act(async () =>
          reject(new Error('Synthetic transfer start failure')),
        );
        await waitFor(() =>
          expect(screen.getByText(/Couldn’t connect/)).toBeTruthy(),
        );
        expect(screen.queryByRole('button', { name: 'Confirm' })).toBeNull();
        expect(screen.queryByRole('progressbar')).toBeNull();
        expect(
          screen.getByRole('button', { name: 'Transfer from another device' }),
        ).toBeEnabled();
        expect(
          screen.getByRole('button', { name: 'Retry connection' }),
        ).toBeEnabled();
      } else {
        fireEvent.press(screen.getByRole('button', { name: 'Back' }));
        expect(harness.mockRouter.dismissTo).toHaveBeenCalledWith('/recovery');
        screen.unmount();
        await harness.mockController.cancelTransfer();
        await act(async () => release());
        expect((await vault.read())!.pending).toBeNull();
        expect(harness.mockController.getSnapshot().transfer).toBeNull();
      }
      expect(harness.mockController.getSnapshot().account).toEqual(original);
    } finally {
      await act(async () => release());
      if (outcome === 'failure') screen.unmount();
      await harness.mockController.cancelTransfer();
    }
  },
);

it('does not navigate for a late transfer result after leaving the recovery screen', async () => {
  const { controls, vault } = await connected();
  const original = harness.mockController.getSnapshot().account;
  await harness.mockController.startTransfer();
  harness.mockTool = 'recover';
  const screen = render(<AccountToolRoute />);
  let release!: () => void;
  controls.holdRequest = {
    path: '/sessions',
    method: 'POST',
    gate: new Promise<void>((resolve) => {
      release = resolve;
    }),
  };
  try {
    fireEvent.press(
      screen.getByRole('button', { name: 'Check approval & finish' }),
    );
    await waitFor(() =>
      expect(harness.mockController.getSnapshot().busy).toBe(true),
    );
    harness.mockFocused = false;
    screen.rerender(<AccountToolRoute />);
  } finally {
    await act(async () => release());
    await waitFor(() =>
      expect(harness.mockController.getSnapshot().busy).toBe(false),
    );
  }
  await harness.mockController.cancelTransfer();
  expect(harness.mockRouter.replace).not.toHaveBeenCalled();
  expect(harness.mockController.getSnapshot().account).toEqual(original);
  expect((await vault.read())!.pending).toBeNull();
});

it.each(['back', 'focus loss'] as const)(
  'keeps the outgoing transfer screen stable after %s while cancellation finishes',
  async (exit) => {
    const { controls } = await connected();
    await harness.mockController.startTransfer();
    let release!: () => void;
    controls.holdRequest = {
      path: `/transfers/${harness.mockController.getSnapshot().transfer!.id}`,
      method: 'DELETE',
      gate: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    harness.mockTool = 'recover';
    const screen = render(<AccountToolRoute />);
    try {
      const code = screen.getByText('012345');
      if (exit === 'back')
        fireEvent.press(screen.getByRole('button', { name: 'Back' }));
      else {
        harness.mockFocused = false;
        screen.rerender(<AccountToolRoute />);
      }
      await waitFor(() =>
        expect(harness.mockController.getSnapshot().cancellationPending).toBe(
          true,
        ),
      );
      expect(screen.getByText('012345')).toBe(code);
      expect(
        screen.getByRole('button', { name: 'Check approval & finish' }),
      ).toBeDisabled();
      expect(screen.queryByLabelText('Recovery key')).toBeNull();
      expect(harness.mockController.getSnapshot().transfer).toBeNull();
      await act(async () => {
        release();
        await harness.mockController.cancelTransfer();
      });
      expect(screen.getByText('012345')).toBe(code);
    } finally {
      await act(async () => {
        release();
        await harness.mockController.cancelTransfer();
      });
      screen.unmount();
    }
  },
);
