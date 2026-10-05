import { SafeAreaView } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { IdentityScreen } from '../app-support/identity/IdentityScreen';
import { useRuntime } from '../app-support/providers/AppProvider';
import { NavigationLink } from '../components/NavigationLink';
import { colors } from '../theme/tokens';
export default function RecoveryRoute() {
  const { identity } = useRuntime();
  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <IdentityScreen controller={identity} managed />
      <SafeAreaView edges={['bottom']}>
        <NavigationLink href="/" replace style={{ textAlign: 'center' }}>
          Back to app
        </NavigationLink>
      </SafeAreaView>
    </View>
  );
}
