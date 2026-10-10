import { Toaster, toast } from 'sonner-native';
import { AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, typography } from '../theme/tokens';
import { useReduceMotion } from './motion';

function stationaryToast() {
  'worklet';
  return { initialValues: { opacity: 1 }, animations: { opacity: 1 } };
}

export function ToastHost({ channel }: { channel: string }) {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  return (
    <Toaster
      id={channel}
      position="top-center"
      offset={insets.top + 12}
      duration={4000}
      fullWindowOverlay={channel !== 'activity-sheet'}
      allowFontScaling
      autoWiggleOnUpdate="never"
      visibleToasts={1}
      animation={
        reduceMotion ? { enter: stationaryToast, exit: stationaryToast } : {}
      }
      toastOptions={{
        titleStyle: { ...typography.body, color: colors.ink },
        style: { backgroundColor: colors.paper },
      }}
    />
  );
}
export function showRecoveryToast(channel: string, id: string) {
  toast.success('Your activity is now saved', { id, toasterId: channel });
  AccessibilityInfo.announceForAccessibility('Your activity is now saved');
}
export function dismissActivityToasts() {
  toast.dismiss();
}
export function showMessageToast(channel: string, message: string) {
  toast.error(message, { toasterId: channel });
  AccessibilityInfo.announceForAccessibility(message);
}
