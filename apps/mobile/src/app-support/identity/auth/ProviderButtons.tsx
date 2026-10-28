import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { ProviderLogo } from '../../../components/auth/ProviderLogo';
import { ScaledText as Text } from '../../../components/typography/ScaledText';
import { fontFamilies, layout, radii, spacing } from '../../../theme/tokens';
import type { SignInProvider } from './types';

/** Approved provider titles, monochrome Apple and Google's four-color G. */
export function ProviderButtons({
  onSignIn,
  disabled = false,
  provider,
  busyProvider,
  retry = false,
}: {
  onSignIn: (provider: SignInProvider) => void;
  disabled?: boolean;
  provider?: SignInProvider | undefined;
  busyProvider?: SignInProvider | null;
  retry?: boolean;
}) {
  return (
    <View style={styles.stack}>
      {(['apple', 'google'] as const)
        .filter((value) => !provider || value === provider)
        .map((value) => (
          <Pressable
            key={value}
            accessibilityRole="button"
            accessibilityLabel={
              retry
                ? 'Try again'
                : `Sign in with ${value === 'apple' ? 'Apple' : 'Google'}`
            }
            accessibilityState={{
              disabled: disabled || !!busyProvider,
              busy: busyProvider === value,
            }}
            aria-busy={busyProvider === value}
            disabled={disabled || !!busyProvider}
            onPress={() => onSignIn(value)}
            style={({ pressed }) => [
              styles.button,
              value === 'apple' ? styles.apple : styles.google,
              pressed && styles.pressed,
            ]}
          >
            {busyProvider === value ? (
              <ActivityIndicator
                size="small"
                color={value === 'apple' ? '#fff' : '#1F1F1F'}
                accessible
                accessibilityRole="progressbar"
                accessibilityLabel={`Signing in with ${value === 'apple' ? 'Apple' : 'Google'}`}
                style={styles.busy}
              />
            ) : (
              <>
                <ProviderLogo provider={value} appleColor="#fff" />
                <Text
                  style={[
                    styles.label,
                    value === 'apple' ? styles.appleLabel : styles.googleLabel,
                  ]}
                >
                  {retry
                    ? 'Try again'
                    : `Sign in with ${value === 'apple' ? 'Apple' : 'Google'}`}
                </Text>
              </>
            )}
          </Pressable>
        ))}
    </View>
  );
}
const styles = StyleSheet.create({
  stack: { gap: spacing.md, width: '100%' },
  button: {
    minHeight: layout.buttonHeight,
    borderRadius: radii.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  apple: { backgroundColor: '#000' },
  google: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#747775' },
  label: { fontFamily: fontFamilies.medium, fontSize: 14, lineHeight: 20 },
  appleLabel: { color: '#fff' },
  googleLabel: { color: '#1F1F1F' },
  pressed: { opacity: 0.7 },
  busy: { height: 20 },
});
