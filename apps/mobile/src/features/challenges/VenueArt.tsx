import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import type { ChallengeCardTheme } from '../../theme/tokens';

const sources: Record<string, ImageSourcePropType> = {
  streets: require('../../../assets/challenges/streets.png'),
  park: require('../../../assets/challenges/park.png'),
  gym: require('../../../assets/challenges/gym.png'),
  cafe: require('../../../assets/challenges/cafe.png'),
  bookstore: require('../../../assets/challenges/bookstore.png'),
  bars: require('../../../assets/challenges/bars.png'),
};
const creamSources: Record<string, ImageSourcePropType> = {
  streets: require('../../../assets/challenges/streets-cream.png'),
  park: require('../../../assets/challenges/park-cream.png'),
  gym: require('../../../assets/challenges/gym-cream.png'),
  cafe: require('../../../assets/challenges/cafe-cream.png'),
  bookstore: require('../../../assets/challenges/bookstore-cream.png'),
  bars: require('../../../assets/challenges/bars-cream.png'),
};
// The Paper crops have uneven transparent/paper margins. Center the drawn
// artwork, rather than its image canvas, against the venue label and copy.
const artworkCenterOffset: Record<string, number> = {
  streets: 2.875,
  park: -2.625,
  gym: 1.125,
  cafe: 6.75,
  bookstore: 0.875,
  bars: -0.875,
};
// Original Paper illustration pixels, cropped and paper-matted by the documented
// extraction script. Text, controls and panel geometry stay native and scalable.
export function VenueArt({
  venue,
  scale = 1,
  background = 'peach',
}: {
  venue: string;
  scale?: number;
  background?: ChallengeCardTheme['artwork'];
}) {
  const artwork = background === 'cream' ? creamSources : sources;
  return (
    <View
      aria-hidden
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 78 * scale,
        height: 63 * scale,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Image
        testID="challenge-illustration"
        source={artwork[venue] ?? artwork.cafe!}
        resizeMode="contain"
        accessible={false}
        style={{
          width: (venue === 'streets' ? 60 : 78) * scale,
          height: (venue === 'streets' ? 58 : 63) * scale,
          transform: [
            { translateX: (artworkCenterOffset[venue] ?? 0) * scale },
          ],
        }}
      />
    </View>
  );
}
export function PaperTexture() {
  return (
    <View
      aria-hidden
      style={[
        StyleSheet.absoluteFill,
        { opacity: 0.25, pointerEvents: 'none' },
      ]}
    >
      <Image
        source={require('../../../assets/challenges/paper-texture.png')}
        aria-hidden
        accessible={false}
        resizeMode="stretch"
        style={[
          StyleSheet.absoluteFill,
          {
            width: '100%',
            height: '100%',
            borderRadius: 20,
          },
        ]}
      />
    </View>
  );
}
export function LowerFlourish({ scale = 1 }: { scale?: number }) {
  return (
    <Image
      source={require('../../../assets/challenges/lower-flourish.png')}
      aria-hidden
      accessible={false}
      resizeMode="contain"
      style={{ alignSelf: 'flex-start', width: 88 * scale, height: 27 * scale }}
    />
  );
}
