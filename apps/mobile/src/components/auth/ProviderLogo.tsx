import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/** Decorative provider marks; the surrounding control supplies its name. */
export function ProviderLogo({
  provider,
  appleColor = '#000',
}: {
  provider: 'apple' | 'google';
  appleColor?: string;
}) {
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {provider === 'apple' ? (
        <Svg width={20} height={24} viewBox="0 0 24 24" aria-hidden>
          <Path
            fill={appleColor}
            d="M17.05 12.54c.03 3.26 2.86 4.34 2.89 4.36-.02.08-.45 1.55-1.49 3.07-.9 1.32-1.84 2.63-3.31 2.66-1.45.03-1.92-.86-3.58-.86-1.65 0-2.17.84-3.55.89-1.42.06-2.51-1.43-3.42-2.74-1.85-2.69-3.27-7.6-1.37-10.91.94-1.64 2.62-2.68 4.45-2.71 1.39-.03 2.7.94 3.55.94.84 0 2.43-1.16 4.09-.99.69.03 2.63.28 3.88 2.11-.1.06-2.32 1.35-2.3 4.18M14.33 4.47c.76-.92 1.28-2.2 1.14-3.47-1.1.04-2.43.73-3.22 1.65-.71.81-1.34 2.11-1.17 3.35 1.23.1 2.48-.63 3.25-1.53"
          />
        </Svg>
      ) : (
        <Svg width={20} height={20} viewBox="0 0 48 48" aria-hidden>
          <Path
            fill="#EA4335"
            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
          />
          <Path
            fill="#4285F4"
            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.86 46.98 24.55Z"
          />
          <Path
            fill="#FBBC05"
            d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.93 23.93 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z"
          />
          <Path
            fill="#34A853"
            d="M24 48c6.48 0 11.94-2.13 15.92-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.19 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"
          />
        </Svg>
      )}
    </View>
  );
}
