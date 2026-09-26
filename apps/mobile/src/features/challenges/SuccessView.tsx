import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fontFamilies } from '../../theme/tokens';

export function SuccessView({ onContinue }: { onContinue: () => void }) {
  const { width, fontScale } = useWindowDimensions();
  const scale = Math.min(width, 420) / 320;
  const textScale = scale * Math.max(1, fontScale);
  return (
    <SafeAreaView
      style={styles.safe}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View
          testID="success-content"
          style={[
            styles.content,
            {
              paddingHorizontal: 29 * scale,
              paddingTop: 50 * scale,
              paddingBottom: 3 * scale,
            },
          ]}
        >
          <View
            testID="success-illustration"
            style={[
              styles.illustration,
              { width: 262 * scale, height: 246 * scale },
            ]}
            accessibilityElementsHidden
          >
            <View testID="success-artwork-blend" style={styles.artworkBlend}>
              <Image
                source={require('../../../assets/illustrations/small-medal.png')}
                accessible={false}
                resizeMode="contain"
                style={styles.artwork}
              />
            </View>
          </View>
          <View
            testID="success-copy"
            style={[styles.copy, { marginTop: 16 * scale, gap: 14 * scale }]}
          >
            <Text
              accessibilityRole="header"
              style={[
                styles.heading,
                {
                  fontSize: 29 * scale,
                  lineHeight: 32 * textScale,
                  letterSpacing: -0.725 * scale,
                },
              ]}
            >
              That’s a win!
            </Text>
            <Text
              style={[
                styles.message,
                { fontSize: 12 * scale, lineHeight: 18 * textScale },
              ]}
            >
              {
                'You followed through on your challenge.\nTake a moment to enjoy it.'
              }
            </Text>
          </View>
          <View style={styles.spacer} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue"
            onPress={onContinue}
            testID="success-continue"
            style={[
              styles.button,
              { minHeight: 44 * scale, paddingVertical: 11 * scale },
            ]}
          >
            <Text
              style={[
                styles.buttonLabel,
                { fontSize: 13 * scale, lineHeight: 18 * textScale },
              ]}
            >
              Continue
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.successCanvas },
  scroll: { flexGrow: 1, alignItems: 'center' },
  content: { flexGrow: 1, width: '100%', maxWidth: 420, alignItems: 'center' },
  illustration: { backgroundColor: colors.successCanvas },
  artworkBlend: { width: '100%', height: '100%', mixBlendMode: 'multiply' },
  artwork: { width: '100%', height: '100%' },
  copy: { width: '100%', alignItems: 'center' },
  heading: {
    width: '100%',
    fontFamily: fontFamilies.display,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.ink,
  },
  message: {
    width: '100%',
    fontFamily: fontFamilies.regular,
    fontWeight: '400',
    textAlign: 'center',
    color: colors.ink,
  },
  spacer: { flexGrow: 1, minHeight: 24 },
  button: {
    width: '100%',
    borderRadius: 99,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: {
    fontFamily: fontFamilies.medium,
    fontWeight: '500',
    color: colors.white,
    textAlign: 'center',
  },
});
