import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import { colors } from '../../theme/tokens';

/** Quiet startup presentation while fonts, saved data or admission resolve. */
export function AppLoadingScreen({
  label = 'Loading JustGO',
}: {
  label?: string;
}) {
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{ busy: true }}
      style={styles.canvas}
    >
      <Image
        source={require('../../../assets/brand/justgo-mark.png')}
        accessible={false}
        contentFit="contain"
        transition={0}
        style={styles.mark}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cream,
  },
  // Match the native splash plugin's imageWidth for a steady handoff.
  mark: { width: 194, height: 194 },
});
