import { act, renderHook } from '@testing-library/react-native';
import { IdentityController } from '../controller';
import { createMemoryVault } from '../storage';
import { useIdentityConfirmation } from './useIdentityConfirmation';

jest.mock('expo-crypto', () => ({
  getRandomValues: jest.fn(),
  randomUUID: jest.fn(),
}));

it('retains captured recovery visibility while an accepted confirmation is pending', async () => {
  const controller = new IdentityController(createMemoryVault(), {
    request: jest.fn(),
  });
  let release!: () => void;
  const action = jest.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const run = jest.fn(async (_id: string, work: () => Promise<void>) => {
    await work();
  });
  const { result } = renderHook(() => useIdentityConfirmation(controller, run));
  act(() =>
    result.current.confirm(
      'Confirm the transfer',
      'start-transfer',
      action,
      true,
    ),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.runConfirmation();
  });
  expect(result.current.confirmation?.recoveryVisible).toBe(true);
  expect(run).toHaveBeenCalledWith('start-transfer', action);
  await act(async () => {
    release();
    await pending;
  });
  expect(result.current.confirmation).toBeNull();
});

it('rejects duplicate confirmation while the controller owns another action', async () => {
  const controller = new IdentityController(createMemoryVault(), {
    request: jest.fn(),
  });
  jest
    .spyOn(controller, 'getSnapshot')
    .mockReturnValue({ ...controller.getSnapshot(), busy: true });
  const action = jest.fn();
  const run = jest.fn();
  const { result } = renderHook(() => useIdentityConfirmation(controller, run));
  act(() =>
    result.current.confirm('Confirm recovery', 'recover-key', action, true),
  );
  await act(async () => {
    await result.current.runConfirmation();
  });
  expect(run).not.toHaveBeenCalled();
  expect(result.current.confirmation?.message).toBe('Confirm recovery');
});

it('does not let an earlier settlement remove a replacement confirmation', async () => {
  const controller = new IdentityController(createMemoryVault(), {
    request: jest.fn(),
  });
  let release!: () => void;
  const action = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const run = async (_id: string, work: () => Promise<void>) => {
    await work();
  };
  const { result, unmount } = renderHook(() =>
    useIdentityConfirmation(controller, run),
  );
  act(() =>
    result.current.confirm('First action', 'start-transfer', action, true),
  );
  let pending!: Promise<void>;
  act(() => {
    pending = result.current.runConfirmation();
  });
  act(() => {
    result.current.cancelConfirmation();
    result.current.confirm(
      'Second action',
      'create-separate-account',
      async () => {},
      false,
    );
  });
  await act(async () => {
    release();
    await pending;
  });
  expect(result.current.confirmation?.message).toBe('Second action');
  act(() =>
    result.current.confirm('Leaving screen', 'start-transfer', action, true),
  );
  act(() => {
    pending = result.current.runConfirmation();
  });
  unmount();
  await act(async () => {
    release();
    await pending;
  });
});
