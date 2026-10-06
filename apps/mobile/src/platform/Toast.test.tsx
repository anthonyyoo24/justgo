import { render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { Toaster, toast } from 'sonner-native';
import { ToastHost, showRecoveryToast, dismissActivityToasts } from './Toast';
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24 }),
}));
jest.mock('sonner-native', () => ({
  Toaster: jest.fn(() => null),
  toast: { success: jest.fn(), dismiss: jest.fn() },
}));
it('uses safe areas, scalable text, the modal host and accessible native recovery announcement', () => {
  render(<ToastHost channel="activity-sheet" />);
  expect(Toaster).toHaveBeenCalledWith(
    expect.objectContaining({
      offset: 36,
      allowFontScaling: true,
      fullWindowOverlay: false,
      autoWiggleOnUpdate: 'never',
    }),
    undefined,
  );
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  showRecoveryToast('activity-sheet', 'one');
  expect(toast.success).toHaveBeenCalledWith('Your activity is now saved', {
    id: 'one',
    toasterId: 'activity-sheet',
  });
  expect(announce).toHaveBeenCalledWith('Your activity is now saved');
  dismissActivityToasts();
  expect(toast.dismiss).toHaveBeenCalled();
  announce.mockRestore();
});
