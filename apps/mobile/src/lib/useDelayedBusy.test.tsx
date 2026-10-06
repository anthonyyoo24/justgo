import { act, renderHook } from '@testing-library/react-native';
import { useDelayedBusy } from './useDelayedBusy';
afterEach(() => jest.useRealTimers());
it('does not flash for fast writes and cleans timers on completion or unmount', async () => {
  jest.useFakeTimers();
  const hook = renderHook(
    ({ busy }: { busy: boolean }) => useDelayedBusy(busy),
    {
      initialProps: { busy: false },
    },
  );
  hook.rerender({ busy: true });
  await act(async () => jest.advanceTimersByTimeAsync(100));
  expect(hook.result.current).toBe(false);
  hook.rerender({ busy: false });
  await act(async () => jest.advanceTimersByTimeAsync(200));
  expect(hook.result.current).toBe(false);
  hook.rerender({ busy: true });
  await act(async () => jest.advanceTimersByTimeAsync(201));
  expect(hook.result.current).toBe(true);
  hook.rerender({ busy: false });
  expect(hook.result.current).toBe(false);
  hook.rerender({ busy: true });
  hook.unmount();
  expect(jest.getTimerCount()).toBe(0);
});
