import Svg, {
  Circle,
  Defs,
  Path,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import type { FeelingCode } from '@justgo/contracts';
import { colors } from '../../theme/tokens';

const faces: Record<
  FeelingCode,
  { center: string; edge: string; mouth: string }
> = {
  a_lot_worse: {
    center: '#D0A0B0',
    edge: colors.feelingMuchLess,
    mouth:
      'M17.844 42.523 C20.883 36.346 24.935 34.436 30 34.306 C35.065 34.176 39.117 36.756 42.156 42.694',
  },
  a_little_worse: {
    center: '#F8D1B9',
    edge: colors.feelingLess,
    mouth: 'M18.192 40.172 C25.08 36.098 35.904 36.078 41.809 40.063',
  },
  about_the_same: {
    center: '#FFEBC3',
    edge: '#FFE3A6',
    mouth: 'M20 38.5 H40',
  },
  a_little_better: {
    center: '#C6E8DB',
    edge: colors.feelingMore,
    mouth: 'M17.671 36.319 C24.863 42.632 35.137 42.696 42.329 36.596',
  },
  a_lot_better: {
    center: '#A2D7BE',
    edge: colors.feelingMuchMore,
    mouth: 'M17.323 34.712 C24.718 47.2 35.282 47.05 42.677 34.844',
  },
};

export function FeelingFace({
  feeling,
  selected,
  size,
}: {
  feeling: FeelingCode;
  selected: boolean;
  size: number;
}) {
  const face = faces[feeling];
  const gradient = `feeling-${feeling}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60" aria-hidden>
      <Defs>
        <RadialGradient id={gradient} cx="50%" cy="40%" rx="60%" ry="60%">
          <Stop offset="0" stopColor={face.center} />
          <Stop offset="1" stopColor={face.edge} />
        </RadialGradient>
      </Defs>
      <Circle
        cx="30"
        cy="30"
        r={selected ? 28 : 29.5}
        fill={`url(#${gradient})`}
        stroke={selected ? colors.feelingInk : 'none'}
        strokeWidth={selected ? 1.6 : 0}
      />
      <Circle cx="21" cy="23.5" r="2.5" fill={colors.feelingInk} />
      <Circle cx="39" cy="23.5" r="2.5" fill={colors.feelingInk} />
      <Path
        d={face.mouth}
        fill="none"
        stroke={colors.feelingInk}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      {selected && (
        <>
          <Circle cx="51" cy="9" r="9" fill={colors.feelingInk} />
          <Path
            d="M47 9.2 L50 12 L55 6.5"
            fill="none"
            stroke={colors.white}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
    </Svg>
  );
}
