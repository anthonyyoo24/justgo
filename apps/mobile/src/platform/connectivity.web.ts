export function listenToConnectivity(listener: (online: boolean) => void) {
  if (typeof window === 'undefined') return () => {};
  const update = () => listener(window.navigator.onLine);
  // Some browsers expose navigator.connection but do not emit its change event
  // on going offline. Browser online/offline events remain the source of truth.
  window.addEventListener('online', update);
  window.addEventListener('offline', update);
  update();
  return () => {
    window.removeEventListener('online', update);
    window.removeEventListener('offline', update);
  };
}
