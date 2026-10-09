import { render } from '@testing-library/react-native';
import { Toaster, toast } from 'sonner';
import {
  ToastHost,
  showRecoveryToast,
  dismissActivityToasts,
  showMessageToast,
} from './Toast.web';
jest.mock('sonner', () => ({
  Toaster: jest.fn(() => null),
  toast: { success: jest.fn(), dismiss: jest.fn(), error: jest.fn() },
}));
it('uses the documented web host and account-scoped toast identity', () => {
  render(<ToastHost channel="activity" />);
  expect(Toaster).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'activity', position: 'top-center' }),
    undefined,
  );
  showRecoveryToast('activity', 'one');
  expect(toast.success).toHaveBeenCalledWith('Your activity is now saved', {
    id: 'one',
    toasterId: 'activity',
  });
  dismissActivityToasts();
  expect(toast.dismiss).toHaveBeenCalled();
});
it('presents safe link failure copy on the matching web host', () => {
  showMessageToast('activity', 'Couldn’t open the Privacy Policy.');
  expect(toast.error).toHaveBeenCalledWith(
    'Couldn’t open the Privacy Policy.',
    { toasterId: 'activity' },
  );
});
