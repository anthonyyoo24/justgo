import { ActivityIndicator, Pressable, View } from 'react-native';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { colors } from '../../../theme/tokens';
import { identityScreenStyles as styles } from './identity-screen-styles';

export function IdentityTextButton({
  label,
  onPress,
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || busy}
      accessibilityState={{ disabled: disabled || busy, busy }}
      onPress={onPress}
      style={({ pressed }) => [styles.textButton, pressed && { opacity: 0.65 }]}
    >
      <View style={styles.textButtonContent}>
        <Text maxFontSizeMultiplier={2} style={styles.link}>
          {label}
        </Text>
        {busy && (
          <ActivityIndicator
            color={colors.ink}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={`${label} in progress`}
          />
        )}
      </View>
    </Pressable>
  );
}
