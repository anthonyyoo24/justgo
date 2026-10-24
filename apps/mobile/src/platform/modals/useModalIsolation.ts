import type { RefObject } from 'react';
import type { ViewInstance } from 'react-native';

// Native Modal owns input isolation; accessibilityViewIsModal owns VoiceOver scope.
export function useModalIsolation(surface: RefObject<ViewInstance | null>) {
  void surface;
}
