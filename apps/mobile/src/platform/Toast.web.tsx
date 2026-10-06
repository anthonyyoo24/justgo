import { Toaster, toast } from 'sonner';
import { colors } from '../theme/tokens';

export function ToastHost({ channel }: { channel: string }) {
  return (
    <Toaster
      id={channel}
      position="top-center"
      duration={4000}
      visibleToasts={1}
      toastOptions={{
        style: {
          fontFamily: 'Inter_400Regular, sans-serif',
          fontSize: 16,
          color: colors.ink,
          background: colors.paper,
        },
      }}
    />
  );
}
export function showRecoveryToast(channel: string, id: string) {
  toast.success('Your activity is now saved', { id, toasterId: channel });
}
export function dismissActivityToasts() {
  toast.dismiss();
}
