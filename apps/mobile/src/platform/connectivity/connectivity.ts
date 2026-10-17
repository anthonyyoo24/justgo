import NetInfo from '@react-native-community/netinfo';
export function listenToConnectivity(listener: (online: boolean) => void) {
  return NetInfo.addEventListener((state) =>
    listener(
      state.isConnected !== false && state.isInternetReachable !== false,
    ),
  );
}
