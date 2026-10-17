import type { RefObject } from 'react';
import type { View } from 'react-native';

// Native Modal owns input isolation; accessibilityViewIsModal owns VoiceOver scope.
export function useModalIsolation(surface: RefObject<View | null>) {
  void surface;
}
