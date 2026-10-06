import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors, type ChallengeCardTheme } from '../../../theme/tokens';

const sources: Record<string, ImageSourcePropType> = {
  streets: require('../../../../assets/challenges/venues/streets.png'),
  park: require('../../../../assets/challenges/venues/park.png'),
  gym: require('../../../../assets/challenges/venues/gym.png'),
  cafe: require('../../../../assets/challenges/venues/cafe.png'),
  bookstore: require('../../../../assets/challenges/venues/bookstore.png'),
  bars: require('../../../../assets/challenges/venues/bars.png'),
};
const creamSources: Record<string, ImageSourcePropType> = {
  streets: require('../../../../assets/challenges/venues/streets-cream.png'),
  park: require('../../../../assets/challenges/venues/park-cream.png'),
  gym: require('../../../../assets/challenges/venues/gym-cream.png'),
  cafe: require('../../../../assets/challenges/venues/cafe-cream.png'),
  bookstore: require('../../../../assets/challenges/venues/bookstore-cream.png'),
  bars: require('../../../../assets/challenges/venues/bars-cream.png'),
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
const lowerFlourishPath =
  'M10 38 C38.4 25.7 73.8 15.3 112 19 C134.9 20.7 159.1 25.5 158 52 C153.1 68.7 140.6 84 120 82 C107.4 75.9 119.1 62.1 128 59 C140.1 53.7 153.4 51.2 168 52 C210.9 50.3 234.6 71.6 264 83 C281.8 90.8 313.9 91.7 331 83';
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
        source={require('../../../../assets/challenges/decoration/paper-texture.png')}
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
    <Svg
      testID="challenge-lower-flourish"
      aria-hidden
      width={88 * scale}
      height={27 * scale}
      viewBox="0 0 352 108"
      style={{ alignSelf: 'flex-start', width: 88 * scale, height: 27 * scale }}
    >
      {/* Traced from the original 4x Paper crop, retaining its canvas margins. */}
      <Path
        d={lowerFlourishPath}
        fill="none"
        stroke={colors.ink}
        strokeWidth={4.2}
        strokeOpacity={0.53}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d={lowerFlourishPath}
        fill="none"
        stroke={colors.ink}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
