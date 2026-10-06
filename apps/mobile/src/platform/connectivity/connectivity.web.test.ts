import { listenToConnectivity } from './connectivity.web';
it('uses browser online/offline events and removes both listeners', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const browser = {
    navigator: { onLine: true },
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: browser,
  });
  try {
    const online = jest.fn();
    const remove = listenToConnectivity(online);
    expect(online).toHaveBeenLastCalledWith(true);
    browser.navigator.onLine = false;
    browser.addEventListener.mock.calls[1]![1]();
    expect(online).toHaveBeenLastCalledWith(false);
    remove();
    expect(
      browser.removeEventListener.mock.calls.map((call) => call[0]),
    ).toEqual(['online', 'offline']);
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: undefined,
    });
    expect(listenToConnectivity(online)).toBeInstanceOf(Function);
  } finally {
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
