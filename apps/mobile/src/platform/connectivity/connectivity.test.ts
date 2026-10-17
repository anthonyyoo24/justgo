import NetInfo from '@react-native-community/netinfo';
import { listenToConnectivity } from './connectivity';
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(),
}));
it('treats unknown connectivity as available, distinguishes confirmed offline and releases the native listener', () => {
  const remove = jest.fn();
  jest.mocked(NetInfo.addEventListener).mockReturnValue(remove);
  const online = jest.fn();
  expect(listenToConnectivity(online)).toBe(remove);
  const listener = jest.mocked(NetInfo.addEventListener).mock.calls[0]![0];
  for (const state of [
    { isConnected: null, isInternetReachable: null },
    { isConnected: false, isInternetReachable: null },
    { isConnected: true, isInternetReachable: false },
    { isConnected: true, isInternetReachable: true },
  ])
    listener(state as Parameters<typeof listener>[0]);
  expect(online.mock.calls).toEqual([[true], [false], [false], [true]]);
});
