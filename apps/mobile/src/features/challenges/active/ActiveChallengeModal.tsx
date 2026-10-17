import { Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActiveChallengeContent,
  type ActiveChallengeProps,
} from './ActiveChallengeContent';

/** Android/web presentation; iOS uses the native challenge route. */
export function ActiveChallengeModal(props: ActiveChallengeProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      testID="active-challenge-modal"
      visible
      presentationStyle="overFullScreen"
      transparent={false}
      animationType="none"
      allowSwipeDismissal={false}
      onRequestClose={() => {}}
    >
      <ActiveChallengeContent {...props} insets={insets} />
    </Modal>
  );
}
