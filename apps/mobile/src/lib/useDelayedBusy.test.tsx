import { act, renderHook } from '@testing-library/react-native';
import { useDelayedBusy } from './useDelayedBusy';
afterEach(() => jest.useRealTimers());
it('does not flash for fast writes and cleans timers on completion or unmount', async () => {
  jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
  const hook = await renderHook(
    ({ busy }: { busy: boolean }) => useDelayedBusy(busy),
    {
      initialProps: { busy: false },
    },
  );
  await hook.rerender({ busy: true });
  await act(async () => jest.advanceTimersByTimeAsync(100));
  expect(hook.result.current).toBe(false);
  await hook.rerender({ busy: false });
  await act(async () => jest.advanceTimersByTimeAsync(200));
  expect(hook.result.current).toBe(false);
  await hook.rerender({ busy: true });
  await act(async () => jest.advanceTimersByTimeAsync(201));
  expect(hook.result.current).toBe(true);
  await hook.rerender({ busy: false });
  expect(hook.result.current).toBe(false);
  await hook.rerender({ busy: true });
  await hook.unmount();
  expect(jest.getTimerCount()).toBe(0);
});
