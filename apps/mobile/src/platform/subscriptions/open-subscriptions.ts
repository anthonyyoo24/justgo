import { requireOptionalNativeModule } from 'expo';
import { Linking, Platform } from 'react-native';

type NativeSubscriptions = { openSubscriptionManagement(): Promise<void> };

/** Opening Apple's controls is not proof that the customer cancelled renewal. */
export async function openSubscriptionManagement(): Promise<void> {
  const native =
    Platform.OS === 'ios'
      ? requireOptionalNativeModule<NativeSubscriptions>('JustGoSubscriptions')
      : null;
  if (native) {
    await native.openSubscriptionManagement();
  } else {
    // Web previews and older installed binaries retain a usable Apple destination.
    await Linking.openURL('https://apps.apple.com/account/subscriptions');
  }
}
