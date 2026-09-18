import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { IdentityScreen } from '../features/identity/IdentityScreen';
import { useRuntime } from '../features/shell/AppProvider';
import { styles } from '../features/shell/ShellScreens';
import { colors } from '../theme/tokens';
export default function RecoveryRoute() {
  const { identity } = useRuntime();
  return (
    <View style={{ flex: 1, backgroundColor: colors.cream }}>
      <IdentityScreen controller={identity} managed />
      <SafeAreaView edges={['bottom']}>
        <Link href="/" replace style={[styles.link, { textAlign: 'center' }]}>
          Back to app
        </Link>
      </SafeAreaView>
    </View>
  );
}
