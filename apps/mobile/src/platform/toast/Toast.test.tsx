let mockReduceMotion = false;
jest.mock('../motion/motion', () => ({
  useReduceMotion: () => mockReduceMotion,
}));
beforeEach(() => {
  mockReduceMotion = false;
});
import { render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { Toaster, toast } from 'sonner-native';
import {
  ToastHost,
  showRecoveryToast,
  dismissActivityToasts,
  showMessageToast,
} from './Toast';
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24 }),
}));
jest.mock('sonner-native', () => ({
  Toaster: jest.fn(() => null),
  toast: { success: jest.fn(), dismiss: jest.fn(), error: jest.fn() },
}));
it('uses safe areas, scalable text, the modal host and accessible native recovery announcement', async () => {
  await render(<ToastHost channel="activity-sheet" />);
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
it('presents link failure on the requested host and announces the same safe message', () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  showMessageToast('activity-sheet', 'Couldn’t open your email app.');
  expect(toast.error).toHaveBeenCalledWith('Couldn’t open your email app.', {
    toasterId: 'activity-sheet',
  });
  expect(announce).toHaveBeenCalledWith('Couldn’t open your email app.');
  announce.mockRestore();
});

it('keeps native toast entry and exit stationary when motion is reduced', async () => {
  mockReduceMotion = true;
  await render(<ToastHost channel="activity-sheet" />);
  const options = jest.mocked(Toaster).mock.calls.at(-1)![0];
  const animation = options.animation!;
  const enter = animation.enter as () => unknown;
  const exit = animation.exit as () => unknown;
  expect(enter()).toEqual({
    initialValues: { opacity: 1 },
    animations: { opacity: 1 },
  });
  expect(exit()).toEqual(enter());
});
